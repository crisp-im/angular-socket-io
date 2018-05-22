/*
 * @license
 * angular-socket-io v0.7.0
 * (c) 2014 Brian Ford http://briantford.com
 * License: MIT
 */

angular.module('btford.socket-io', []).
  provider('socketFactory', function () {

    'use strict';

    // when forwarding events, prefix the event name
    var defaultPrefix = 'socket:',
      ioSocket;

    var aggregatedCallbacks = [],
        aggregatedTimeout = null;

    // expose to provider
    this.$get = ['$rootScope', function ($rootScope) {

      var aggregateCallback = function (callback, aggregateDelay) {
        aggregatedCallbacks.push(callback);

        // Schedule timeout?
        if (aggregatedTimeout === null) {
          aggregatedTimeout = setTimeout(function() {
            // Trigger all delayed callbacks
            var delayedCallback;

            while (delayedCallback = aggregatedCallbacks.shift()) {
              delayedCallback();
            }

            aggregatedTimeout = null;
          }, (aggregateDelay || 10));
        }
      };

      var asyncAngularify = function (socket, callback, aggregateDelay) {
        return callback ? function () {
          var args = arguments;

          aggregateCallback(function () {
            callback.apply(socket, args);
          }, aggregateDelay);
        } : angular.noop;
      };

      return function socketFactory (options) {
        options = options || {};
        var socket = options.ioSocket || io.connect();
        var prefix = options.prefix === undefined ? defaultPrefix : options.prefix ;
        var defaultScope = options.scope || $rootScope;

        var addListener = function (eventName, callback) {
          socket.on(eventName, asyncAngularify(socket, callback, 1000));
        };

        var addOnceListener = function (eventName, callback) {
          socket.once(eventName, asyncAngularify(socket, callback, 1000));
        };

        var wrappedSocket = {
          on: addListener,
          addListener: addListener,
          once: addOnceListener,

          emit: function (eventName, data, callback) {
            var lastIndex = arguments.length - 1;
            var callback = arguments[lastIndex];
            if(typeof callback == 'function') {
              callback = asyncAngularify(socket, callback);
              arguments[lastIndex] = callback;
            }
            return socket.emit.apply(socket, arguments);
          },

          removeListener: function (ev, fn) {
            if (fn && fn.__ng) {
              arguments[1] = fn.__ng;
            }
            return socket.removeListener.apply(socket, arguments);
          },

          removeAllListeners: function() {
            return socket.removeAllListeners.apply(socket, arguments);
          },

          disconnect: function (close) {
            return socket.disconnect(close);
          },

          connect: function() {
            return socket.connect();
          },

          // when socket.on('someEvent', fn (data) { ... }),
          // call scope.$broadcast('someEvent', data)
          forward: function (events, scope) {
            if (events instanceof Array === false) {
              events = [events];
            }
            if (!scope) {
              scope = defaultScope;
            }
            events.forEach(function (eventName) {
              var prefixedEvent = prefix + eventName;
              var forwardBroadcast = asyncAngularify(socket, function () {
                Array.prototype.unshift.call(arguments, prefixedEvent);
                scope.$broadcast.apply(scope, arguments);
              });
              scope.$on('$destroy', function () {
                socket.removeListener(eventName, forwardBroadcast);
              });
              socket.on(eventName, forwardBroadcast);
            });
          }
        };

        return wrappedSocket;
      };
    }];
  });
