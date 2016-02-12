# Temple

[![Build Status](https://travis-ci.org/BeneathTheInk/Temple.svg?branch=master)](https://travis-ci.org/BeneathTheInk/Temple) [![Coverage Status](https://coveralls.io/repos/github/BeneathTheInk/Temple/badge.svg?branch=master)](https://coveralls.io/github/BeneathTheInk/Temple?branch=master)

A JavaScript view framework.

* __Reactive__ - Powered by [Trackr](https://github.com/beneaththeink/trackr), Temple automatically updates the DOM as data changes.
* __Template Driven__ - Use a Mustache-HTML hybrid syntax to quickly generate UI scaffolding.
* __Modular & Extensible__ - All views are encapsulated, reusable components.
* __Data Neutral__ - Temple can be easily integrated with existing frameworks and platforms.
* __Modern__ - Under the hood, Temple uses new technologies like ES2015 and Web Components, polyfilling where necessary to support older browsers.

## Example

Here is a basic template in Temple. This just uses a simple variable, but Temple has support for most of the major [Mustache features](http://mustache.github.io/mustache.5.html).

```html
<hello-world>
    <h1>Hello {{ name }}</h1>
</hello-world>
```

```js
// the above template is rendered
Temple.render(template);

// create an instance from a view name and data
var view = Temple.create("hello-world", { name: "World" });

// render and append to the document body
view.paint("body");
```

By default, data passed to Temple is not reactive, meaning that re-renders will need to be handled manually. Views can easily be made reactive by using reactive objects, provided by [trackr-objects](http://ghub.io/trackr-objects).

```js
// create a reactive object to serve as data
var data = new Temple.Map({ name: "World" })
var view = Temple.create("hello-world", data).paint("body");

// later, change the data and watch the DOM auto-update
data.set("name", "John");
```

Listening for DOM events is really easy in Temple. Enable the plugin and then add an `on-<event>` attribute to any element.

```html
<alert-anchor>
    <!-- anchor element with on-click attribute -->
    <a href="#" on-click="alert">Click Me</a>

    <!-- scripts are called when views are initiated -->
    <script>
    // enable the DOM events plugin
    this.use("actions");

    // add the special alert action
    this.addAction("alert", function(e) {
        e.original.preventDefault();
        alert("You clicked me!");
    });
    </script>
</alert-anchor>
```

Temple uses the new Web Components API to give every view its own custom element. This allows views to be used as reusable modules.

```html
<!-- resuable view -->
<list-item>
    <li>{{ item }}</li>
</list-item>

<!-- main view which uses the above view many times -->
<my-view>
    {{# list }}
    <list-item />
    {{/ list }}
</my-view>
```
