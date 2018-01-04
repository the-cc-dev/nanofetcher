var Nanocomponent = require('nanocomponent')
var morph = require('nanomorph')
var onidle = require('on-idle')
var onload = require('on-load')
var assert = require('assert')

const STATUS = Object.freeze({
    UNFETCHED: Symbol('UNFETCHED'),
    FETCHING: Symbol('FETCHING'),
    FETCHED: Symbol('FETCHED'),
})

module.exports = Nanofetch

function Nanofetch () {
  if (!(this instanceof Nanofetch)) return new Nanofetch()
  this._status = STATUS.UNFETCHED
  this._data = null
  this._dataID = null
  this._createdID = null
  this._prefetchCbs = []
  // make sure child class does not have createElement, but disregard Nanocomponent.prototype.createElement
  assert.ok(!this.constructor.prototype.hasOwnProperty('createElement'), 'nanofetch: createElement should not be defined')
  Nanocomponent.call(this)
}

Nanofetch.prototype = Object.create(Nanocomponent.prototype)

Nanofetch.prototype.createElement = function() {
  var args = new Array(arguments.length)
  for (var i = 0; i < arguments.length; i++) args[i] = arguments[i]

  var id = this.constructor.identity.apply(null, args)

  // createElement id should match the id of previously fetched or fetching data,
  // unless an element has already been created for the (now stale) data
  if ((this._status == STATUS.FETCHED || this._status == STATUS.FETCHING)) {
    assert.ok((id == this._dataID || this._dataID == this._createdID), 'nanofetch.createElement: called with different arguments than nanofetch.prefetch')
    if (id != this._dataID) {
      this._data = null
      this._dataID = null
      this._status = STATUS.UNFETCHED
    }
  }

  if (this._status == STATUS.UNFETCHED) {
    if (this.init) this.init.apply(this, args)
  }


  this._createdID = id
  var el
  if (this._status == STATUS.FETCHED) {
    el = this.hydrate.call(this, this._data)
    if (this._hasWindow && this.done) onload(el, this.done.bind(this), () => {}, this._ncID)
  } else {
    el = this.placeholder.call(this)
    if (this._hasWindow) onload(el, this._load.bind(this), () => {}, this._ncID)
  }
  return el
}

Nanofetch.prototype._load = function() {
  if (this._status == STATUS.UNFETCHED) {
    onidle(() => {
      var cb = this.done || (() => {})
      this._handleFetch(this._createdID, cb)
    })
  } else if (this._status == STATUS.FETCHED) {
    // only happens if fetching finishes after createElement but before onload fires
    morph(this.element, this.hydrate.call(this, this._data))
    if (this.done) this.done.call(this)
  } else { // STATUS.FETCHING
    if (this.done) this._prefetchCbs.push(this.done.bind(this))
  }
}

Nanofetch.prototype._handleFetch = function(id, cb) {
  this._status = STATUS.FETCHING
  this._dataID = id
  this.fetch.call(this, (err, data) => {
    if (err) {
      this._status = STATUS.UNFETCHED
      this._dataID = null
      cb(err)
    }
    if (id != this._dataID) {
      return
    }
    this._data = data
    this._status = STATUS.FETCHED
    if (this.element) morph(this.element, this.hydrate.call(this, this._data))
    cb()
  })
}

Nanofetch.prototype.prefetch = function() {
  var cb = arguments[arguments.length - 1]
  assert.equal(typeof cb, 'function', 'nanofetch.prefetch: last argument must be callback')
  var args = []
  for (var i = 0; i < arguments.length - 1; i++) args.push(arguments[i])

  var id = this.constructor.identity.apply(null, args)

  // prefetch id should match the id of previously fetched or fetching data,
  // unless an element has already been created for the (now stale) data
  if ((this._status == STATUS.FETCHED || this._status == STATUS.FETCHING)) {
    assert.ok((id == this._dataID || this._dataID == this._createdID), 'nanofetch.prefetch: called twice with different arguments')
    if (id != this._dataID) {
      this._data = null
      this._dataID = null
      this._status = STATUS.UNFETCHED
    }
  }

  if (this._status == STATUS.FETCHED) {
      return cb()
  } else if (this._status == STATUS.FETCHING) {
      this._prefetchCbs.push(cb)
      return
  } else {
    this._prefetchCbs.push(cb)
    if (this.init) this.init.apply(this, args)
    this._handleFetch(id, (err) => {
      // callback all prefetch calls at the same time
      for (var i = 0; i < this._prefetchCbs.length; i++) {
        if (err) this._prefetchCbs[i](err)
        this._prefetchCbs[i]()
      }
    })
  }
}

Nanofetch.identity = function() {
  throw new Error('nanofetch: static method identity should be implemented!')
}

Nanofetch.prototype.fetch = function() {
  throw new Error('nanofetch: fetch should be implemented!')
}

Nanofetch.prototype.placeholder = function() {
  throw new Error('nanofetch: placeholder should be implemented!')
}

Nanofetch.prototype.hydrate = function() {
  throw new Error('nanofetch: hydrate should be implemented!')
}