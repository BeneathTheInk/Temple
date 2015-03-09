# Temple

A JavaScript view framework.

* __Reactive__ - Powered by [Trackr](https://github.com/beneaththeink/trackr), Temple automatically updates the DOM as data changes.
* __Template Driven__ - Use a Mustache-HTML hybrid syntax to quickly generate UI scaffolding.
* __Modular & Extensible__ - All views are encapsulated, reusable components.
* __Data Neutral__ - Temple can be easily integrated with existing frameworks and platforms.

## Example

Here is a basic example of using Temple. This just uses a simple variable, but Temple has support for most of the major [Mustache features](http://mustache.github.io/mustache.5.html).

```javascript
// create a view instance from a template and data
var tpl = Temple.render("<h1>Hello {{ name }}</h1>", { name: "World" });

// render and append to the document body
tpl.paint("body");

// later, change the value and watch it auto-update the DOM
tpl.data.name = "John";
```

Listening for DOM events is really easy in Temple. Enable the plugin and then add an `on-<event>` attribute to any element.

```javascript
// create a view instance from just a template
var tpl = Temple.render("<a href='#' on-click='alert'>Click Me</a>")

// enable the DOM events plugin
.use("actions")

// add the special alert action
.addAction("alert", function(e) {
    e.original.preventDefault();
    alert("You clicked me!");
})

// render and append to the document body
.paint("body");
```

Temple even lets you turn your views into reusable components.

```javascript
// a reusable View class
var Hello = Temple.extend({
    template: "Hello {{ name }}"
});

// render a new template that uses the view as a partial
var tpl = Temple.render("<h1>{{> hello }}</h1>", { name: "John" })
.setPartial("hello", Hello)
.paint("body");

// views can also be rendered directly
var tpl2 = new Hello({ name: "World" }).paint("body");
```