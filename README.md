# Temple

A reactive [Mustache](http://mustache.github.io/) view framework. <http://beneaththeink.com/temple>

* __Modular & Extensible__ - All views are encapsulated, reusable components.
* __Data Neutral__ - Temple can be easily integrated with existing frameworks and platforms.
* __Lightweight__ - A lot functionality has been packed into this very small package.
* __Reactive__ - Keep the interface up-to-date with auto-running computations powered by [Trackr](https://github.com/beneaththeink/trackr).

## Install

Download the latest version from our [release page](https://github.com/BeneathTheInk/Temple/releases) and use via a script tag. The variable `Temple` will be attached to `window`.

```html
<script type="text/javascript" src="temple.js"></script>
```

If using Browserify or Node.js, you can install via NPM and use via `require("templejs")`.

```shell
$ npm install templejs
```

## Example

Here is a basic example of using Temple. This just uses a simple variable, but Temple has support for all the major [Mustache features](http://mustache.github.io/mustache.5.html).

```javascript
// create a view instance from a template and data
var tpl = Temple.render("<h1>Hello {{ name }}</h1>", { name: "World" });

// render and append to the document body
tpl.paint("body");

// later, change the value reactively
tpl.data.name = "John";
```

Temple also has first-class support for DOM events. Enable the plugin and then add an `on-<event>` attribute to any element.

```javascript
// create a view instance from just a template
var tpl = Temple.render("<a href='#' on-click='alert'>Click Me</a>")

// DOM events are treated as plugin, so they must be enabled
.use("actions")

// add the special alert action
.addAction("alert", function(e) {
    e.original.preventDefault();
    alert("You clicked me!");
})

// render and append to the document body
.paint("body");
```

You can even turn your views into reusable components.

```javascript
// a reusable template with default data
var Hello = Temple.extend({
    template: "Hello {{ name }}",
    initialState: { name: "World" }
});

// render a new template that uses it as a partial
var tpl = Temple.render("<h1>{{> hello }}</h1>", { name: "John" })
.setPartial("hello", Hello)
.paint("body");
```