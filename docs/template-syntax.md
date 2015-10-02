# Template Syntax

Temple's template syntax is a hybrid of Mustache and HTML, with a few Temple specific additions. Templates are parsed and compiled into executable JavaScript, allowing for advanced features like embedded scripts and ahead-of-time optimization.

To render a template, use `Temple.render()`, which will register the template globally. You can then get the template class with `Temple.get()`, or instantiate templates directly with `Temple.create()`;

```js
Temple.render("<my-template>Hello World</my-template>");
Temple.create("my-template").paint(document.body);
```

- [Templates](#templates)
- [HTML](#html)
- [Variables](#variables)
- Sections
- Partials
- [Views](#views)
- [Embedded JavaScript](#embeddedjavascript)

## Templates

A template is a custom element which defines a dynamic piece of DOM. Templates are complete entities, making them easy to create, move and update.

A template is defined with a opening and closing tag at the root. The templates's name must be globally unique and have at least one dash.

```html
<awesome-template>
	This is an awesome template.
</awesome-template>
```

Since templates are turned into regular DOM elements, they can accept attributes. These attributes will be rendered on any views created from the template.

```html
<large-text style="font-size: 64px; font-weight: bold;">
	Something very important to say.
</large-text>
```

Templates can extend existing DOM elements or other templates. Extended templates inherit all properties from the parent, including attributes and scripts.

```html
<!-- extends the <H1> tag -->
<hello-world extends="h1">Hello World</hello-world>

<!-- extends the <hello-world> template -->
<super-template extends="hello-world">
	Overriding like a boss.
</super-template>
```

Templates can be rendered by other templates, forming the core modularity of Temple. Use the template name as you would a custom element. You can set attributes on the element, overriding those set by the original template.

```html
<!-- defines custom template -->
<private-badge extends="span" class="badge badge-primary">
	<i class="icon icon-lock"></i>
	Private
</private-badge>

<!-- uses custom template -->
<card-title>
	My Secret Thing <private-badge class="badge badge-secondary" />
</card-title>
```

## HTML

Templates support basic HTML. Most elements are allowed, including custom elements. Place element nodes inside of the template tags.

```html
<page-header>
	<h1>
		A Title
		<small>with a subheader.</small>
	</h1>
</page-header>
```

Elements can also contain attributes.

```html
<account-signin>
	<h1>Sign In</h1>

	<form class="signin-form" method="post" action="/signin">
		<label for="username-input">Username</label>
		<input type="text" name="username" id="username-input" />

		<label for="password-input">Password</label>
		<input type="text" name="password" id="password-input" />

		<button type="submit">Sign In</button>
	</form>
</account-signin>
```

> Decorators, a runtime feature, are applied to elements through attributes. This means you can override an attribute's default behavior by adding a decorator with the same name.

## Variables

Use variables to retrieve and display information from the current context. Variables can only be used in two places, inline with the HTML nodes or as part of an attribute value.

```html
<name-card>
	<h1 style="color: {{ color }};">
		My name is {{ name }}.
	</h1>
</name-card>
```

By default, variable results are escaped before being printed in the DOM. To print something as raw HTML, use triple mustache notation, or the `&` tag.

```html
<my-template>
	{{ escaped }}
	{{{ not_escaped }}}
	{{& alsoNotEscaped }}
</my-template>
```

The path within the variable is used to look up information in the context stack, returning the first value that isn't undefined. Similar to Mustache variables, if the value is function it is executed in current context, and its returned value is used instead.

Separate path parts with a `.` and create dynamic paths with brackets, just like in JavaScript.

```html
<my-template>
	{{ my.deep.path }}
	{{ my["super"][0][deep.path] }}
</my-template>
```

Variable results can also be filtered through other variables with the pipe `|` character. If the value at the path isn't a function, its value is directly returned, overriding anything returned previously.

```html
<my-template>
	{{ h | g | f }}
</my-template>
```

The above is the same as running `f(g(h()))`.


## Views

Views are instances of templates. To create a view, call `Temple.create()` with the template name and some data. `.paint()` will render the view and inject it into the document.

```js
var view = Temple.create("hello-world", { name: "World" });
view.paint(document.body);
```

Views can be rendered by other views. Just use the template name as you would an element. You can also set attributes on the view, overriding those set by the template.

```html
<my-template>
	<h1><hello-world class="hello-custom" /></h1>
</my-template>

<hello-world class="hello">Hello {{ name }}</hello-world>
```

Use the special `@super` partial to render the parent's template. This allows the parent template to be wrapped or scoped before being rendered.

```html
<hello-world>Hello {{ name }}</hello-world>

<hello-world-2 extends="hello-world">
	<strong>{{> @super }}</strong>
</hello-world-2>
```

When rendering views, pass additional template tags to be rendered by the view. Views can use the template with the `@body` partial. Keep in mind that the partial is rendered in a context choosen by the view, which is usually a different context then where it is defined.

```html
<my-template>
	<hello-world>World</hello-world>
</my-template>

<hello-world>Hello {{> @body }}</hello-world>
```

## Embedded JavaScript

Add `<script>` tags to embed code within your template. The script tags are only supported in the root of the template or the root of a view.

Scripts in the root of the template are executed immediately. This is a good place to import dependencies and prep your views. Scripts and views are run in the same order declared, giving you access to the newly created view classes.

```html
<hello-world>
	Hello {{ name }}
</hello-world>

<script>
Views["hello-world"].helpers({
	name: function() {
		return "World";
	}
});
</script>
```

Scripts in the root of a view are executed whenever a component is made from the view. This is great for setting up internal view state.

```html
<hello-world>
	<script>
		this.helpers({
			name: function() {
				return "World";
			}
		});
	</script>

	Hello {{ name }}
</hello-world>
```
