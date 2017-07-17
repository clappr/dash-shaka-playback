import {HTML5Video, Log, Events} from 'clappr'
import shaka from 'shaka-player'

const SEND_STATS_INTERVAL_MS = 30 * 1e3
const DEFAULT_LEVEL_AUTO = -1

class DashShakaPlayback extends HTML5Video {
  static get Events () {
    return {
      SHAKA_READY: 'shaka:ready'
    }
  }

  static canPlay (resource, mimeType = '') {
    shaka.polyfill.installAll()
    var browserSupported = shaka.Player.isBrowserSupported()
    var resourceParts = resource.split('?')[0].match(/.*\.(.*)$/) || []
    return browserSupported && ((resourceParts[1] === 'mpd') || mimeType.indexOf('application/dash+xml') > -1 || (resourceParts[1] === 'm3u8') )
  }

  get name () {
    return 'dash_shaka_playback'
  }

  get shakaVersion () {
    return shaka.player.Player.version
  }

  get shakaPlayerInstance () {
    return this._player
  }

  get levels () {
    return this._levels
  }

  set currentLevel (id) {
    this._currentLevelId = id
    var isAuto = this._currentLevelId === DEFAULT_LEVEL_AUTO

    this._player.configure({abr: {enable: !isAuto}})
    this.trigger(Events.PLAYBACK_LEVEL_SWITCH_START)
    if (!isAuto) {
      this.selectTrack(this.videoTracks.filter((t) => t.id === this._currentLevelId)[0])
    }
    this.trigger(Events.PLAYBACK_LEVEL_SWITCH_END)
  }

  get currentLevel () {
    return this._currentLevelId || DEFAULT_LEVEL_AUTO
  }

  constructor (options) {
    super(options)
    this._levels = []
    options.autoPlay && this.play()
  }

  play () {
    if (!this._player) {
      this._setup()
    }

    if (!this.isReady) {
      this.once(DashShakaPlayback.Events.SHAKA_READY, this.play)
      return
    }

    this._src = this.el.src
    super.play()
  }

  // skipping setup `setupSrc` on tag video
  setupSrc () {}

  // skipping ready event on video tag in favor of ready on shaka
  _ready () {}

  get isReady () {
    return this._isShakaReadyState
  }

  // skipping error handling on video tag in favor of error on shaka
  error (event) {
    Log.error('an error was raised by the video tag', event, this.el.error)
  }

  isHighDefinitionInUse () {
    return !!this.highDefinition
  }

  stop () {
    clearInterval(this.sendStatsId)
    this._sendStats()

    this._player.unload().then(() => {
      super.stop()
      this._player = null
      this._isShakaReadyState = false
    }).catch(() => {
      Log.error('shaka could not be unloaded')
    })
  }

  get textTracks () {
    return this._player && this._player.getTextTracks()
  }

  get audioTracks () {
    return this._player && this._player.getVariantTracks().filter((t) => t.mimeType.startsWith('audio/'))
  }

  get videoTracks () {
    return this._player && this._player.getVariantTracks().filter((t) => t.mimeType.startsWith('video/'))
  }

  getPlaybackType () {
    return (this._player && this._player.isLive() ? 'live' : 'vod') || ''
  }

  selectTrack (track) {
    this._player.selectTrack(track)
    this._onAdaptation()
  }

  destroy () {
    clearInterval(this.sendStatsId)

    if (this._player) {
      this._destroy()
    } else {
      this._player.destroy()
        .then(() => this._destroy())
        .catch(() => {
          this._destroy()
          Log.error('shaka could not be destroyed')
        })
    }
  }

  _setup () {
    this._isShakaReadyState = false
    this._player = this._createPlayer()
    this._options.shakaConfiguration && this._player.configure(this._options.shakaConfiguration)
    this._options.shakaOnBeforeLoad && this._options.shakaOnBeforeLoad(this._player)

    var playerLoaded = this._player.load(this._options.src)
    playerLoaded.then(() => this._loaded())
      .catch((e) => this._setupError(e))
  }

  _createPlayer () {
    var player = new shaka.Player(this.el)
    player.addEventListener('error', this._onError.bind(this))
    player.addEventListener('adaptation', this._onAdaptation.bind(this))
    player.addEventListener('buffering', this._onBuffering.bind(this))
    return player
  }

  _onBuffering (e) {
    var event = e.buffering ? Events.PLAYBACK_BUFFERING : Events.PLAYBACK_BUFFERFULL
    this.trigger(event)
  }

  _loaded () {
    this._isShakaReadyState = true
    this.trigger(DashShakaPlayback.Events.SHAKA_READY)
    super._ready()
    this._startToSendStats()
    this._fillLevels()
  }

  _fillLevels () {
    if (this._levels.length === 0) {
      this._levels = this.videoTracks.map((videoTrack) => { return {id: videoTrack.id, label: `${videoTrack.height}p`} }).reverse()
      this.trigger(Events.PLAYBACK_LEVELS_AVAILABLE, this.levels)
    }
  }

  _startToSendStats () {
    const intervalMs = this._options.shakaSendStatsInterval || SEND_STATS_INTERVAL_MS
    this.sendStatsId = setInterval(() => this._sendStats(), intervalMs)
  }

  _sendStats () {
    this.trigger(Events.PLAYBACK_STATS_ADD, this._player.getStats())
  }

  _setupError (err) {
    this._onError(err)
  }

  _onError (err) {
    Log.error('Shaka error event:', err)
    this.trigger(Events.PLAYBACK_ERROR, err, this.name)
  }

  _onAdaptation () {
    var activeVideo = this.videoTracks.filter((t) => t.active === true)[0]

    this._fillLevels()

    Log.debug('an adaptation has happened:', activeVideo)
    this.highDefinition = (activeVideo.height >= 720)
    this.trigger(Events.PLAYBACK_HIGHDEFINITIONUPDATE, this.highDefinition)
    this.trigger(Events.PLAYBACK_BITRATE, {
      bandwidth: activeVideo.bandwidth,
      width: activeVideo.width,
      height: activeVideo.height,
      level: activeVideo.id
    })
  }

  _destroy () {
    super.destroy()
    this._isShakaReadyState = false
    Log.debug('shaka was destroyed')
  }
}

export default DashShakaPlayback
