var _ = require("underscore"),
	easing = require("./easing"),
	Promise = require("./avow"),
	Mustache = require("../../");

module.exports = function() {
	this._animations = {};
	this.animate = animate;
	this.stopAnimating = stopAnimating;
}

function animate(path, to, options) {
	// always cancel any existing animations
	this.stopAnimating(path);

	var anim = new Animation(options),
		from = this.get(path, { depend: false });

	anim.on("step", function(val) {
		this.set(path, val);
	}, this);

	this._animations[path] = anim;
	anim.start(from, to);

	return anim;
}

function stopAnimating(path) {
	if (_.has(this._animations, path))
		this._animations[path].cancel();

	return this;
}

// some browsers are picky
var requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                            window.webkitRequestAnimationFrame || window.oRequestAnimationFrame;

function Animation(options) {
	options = options || {};

	if (_.isString(options.easing)) {
		if (easing[options.easing] == null)
			throw new Error("Unknown predefined easing function `" + options.easing + "'.");

		options.easing = easing[options.easing];
	}

	var dur = options.duration;
	this.easing = _.isFunction(options.easing) ? options.easing : function(t) { return t; };
	this.duration = _.isNumber(dur) && !_.isNaN(dur) && dur > 0 ? dur : 300;
	this.repeat = _.isNumber(options.repeat) ? options.repeat : !!options.repeat;
	this.reverse = options.reverse == null ? true : !!options.reverse;
	this.running = false;
}

Mustache.Animation = Animation;
_.extend(Animation.prototype, Mustache.Events);
Animation.easing = easing;

Animation.prototype.onStep = function(fn) {
	if (!_.isFunction(fn)) throw new Error("Expecting function for step.");
	this.on("step", fn);
	return this;
}

Animation.prototype.onComplete = function(fn) {
	if (!_.isFunction(fn)) throw new Error("Expecting function for complete.");
	this.on("complete", fn);
	return this;
}

Animation.prototype.start = function(from, to) {
	if (!_.isNumber(from) || !_.isNumber(to))
		throw new Error("Animation can only handle numbers.");

	this.cancel();
	this.running = true;
	
	var self = this,
		diff = to - from,
		startTime = null,
		count = 0,
		repeat = 0;

	if (this.repeat) {
		repeat = _.isNumber(this.repeat) ? this.repeat : Infinity;
	}

	function run() {
		requestAnimationFrame(function(ts) {
			try {
				// immediately stop if animation was canceled
				if (self.canceled) {
					delete self.canceled;
					self._complete(count);
					return;
				}

				if (startTime == null) startTime = ts;

				var tick = self._tick(ts - startTime);
				var delta = tick[1] * diff;
				var val = self.reverse && count % 2 ? to - delta : from + delta;

				self.trigger("step", val, count);

				if (tick[0]) {
					startTime = null;
					count++;

					// only exit if # of runs is greater than # of repeats
					if (count > repeat) {
						self._complete(count);
						return;
					}
				}

				run();
			} catch(err) {
				self.cancel();
				self.trigger("error", err);
			}
		});
	}
	
	this.trigger("start", from, to);
	run();

	return this;
}

Animation.prototype._tick = function(elapsed) {
	return elapsed >= this.duration ? [true, 1] : [false, this.easing(elapsed / this.duration)];
}

Animation.prototype._complete = function(count) {
	if (!this.running) return this;
	this.running = false;
	this.trigger("complete", count);
	return this;
}

Animation.prototype.cancel = function() {
	if (!this.running || this.canceled) return this;
	this.canceled = true;
	this.trigger("cancel");
	return this;
}

Animation.prototype.then = function(success, fail) {
	var self = this;

	return new Promise(function(resolve, reject) {
		var onComplete, onError;

		function clean() {
			self.off("complete", onComplete);
			self.off("error", onError);
		}

		self.on("complete", onComplete = function() {
			clean();
			resolve(self);
		});

		self.on("error", onError = function(err) {
			clean();
			reject(err);
		});
	})

	.then(success, fail);
}