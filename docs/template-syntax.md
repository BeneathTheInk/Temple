# Template Syntax

Temple's template syntax is a hybrid of Mustache and HTML, with a few Temple specific additions. Templates are parsed and compiled into executable JavaScript, allowing for advanced features like embedded scripts and ahead-of-time optimization.

To render a template, use `Temple.render()`, which will register the views globally. You can then get the view class with `Temple.get()`, or instantiate views directly with `Temple.create()`;

```js
Temple.render("<my-template>Hello World</my-template>");
Temple.create("my-template").paint(document.body);
```

- [Views](#views)
- [HTML](#html)
- [Variables](#variables)
- [Sections](#sections)
- [Partials](#partials)
- [Embedded JavaScript](#embeddedjavascript)

## Views

A view is a custom element which defines a dynamic piece of DOM. Views are complete entities, making them easy to create, move and update.

A view is defined with an opening and closing tag at the root. The views's name must be globally unique and have at least one dash.

```html
<awesome-view>
	This is an awesome view.
</awesome-view>
```

Since views are turned into regular DOM elements, they can accept attributes. These attributes will be rendered on any instances created from the view.

```html
<large-text style="font-size: 64px; font-weight: bold;">
	Something very important to say.
</large-text>
```

Views can extend existing DOM elements or other views. Extended views inherit all properties from the parent, including attributes and scripts.

```html
<!-- extends the <H1> tag -->
<hello-world extends="h1">Hello World</hello-world>

<!-- extends the <hello-world> template -->
<super-view extends="hello-world">
	Overriding like a boss.
</super-view>
```

Views can be rendered by other views, forming the core modularity of Temple. Use the view name as you would a custom element. You can set attributes on the element, overriding those set by the original view.

```html
<!-- defines custom view -->
<private-badge extends="span" class="badge badge-primary">
	<i class="icon icon-lock"></i>
	Private
</private-badge>

<!-- uses custom view -->
<card-title>
	My Secret Thing <private-badge class="badge badge-secondary" />
</card-title>
```

## HTML

Views support basic HTML. Most elements are allowed, including custom elements. Place element nodes inside of the view tags.

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

Use variables to retrieve and display information from the current context. Variables can only be used in two places: inline with the HTML nodes or as part of an attribute value.

```html
<name-card style="color: {{ color }};">
	My name is {{ name }}.
</name-card>
```

By default, variable results are escaped before being printed in the DOM. To print something as raw HTML, use triple mustache notation, or the `&` tag.

```html
<my-view>
	{{ escaped }}
	{{{ not_escaped }}}
	{{& alsoNotEscaped }}
</my-view>
```

The path within the variable is used to look up information in the context stack, returning the first value that isn't undefined. Similar to Mustache variables, if the value is a function it is executed in current context and its returned value is used instead.

Separate path parts with a period and create dynamic paths with brackets, just like in JavaScript.

```html
<my-view>
	{{ my.deep.path }}
	{{ my["super"][0][deep.path] }}
</my-view>
```

You can print the value in current context with a single period.

```html
<my-view>
	{{ . }}
</my-view>
```

Variable results can also be filtered through other variables with the pipe `|` character. This works similarly to other template languages with the concept of a filters, the result of each path is passed as the input for the next value. If the value at the path isn't a function, its value is directly returned, overriding anything returned previously. The below filter is the same as running `f(g(h()))` in JavaScript.

```html
<my-view>
	{{ h | g | f }}
</my-view>
```

## Sections

The section tag allows for parts of the view to be rendered one or more times, depending on the value of the path in the section tag. A section tag has an opening and closing tag, whose paths much match.

```html
<scoped-view>
	{{# data }}
		scoped to data
		{{ foo.bar }}
	{{/ data }}
</scoped-view>
```

These work just like Mustache sections. If the value is `null`, `undefined`, `false` or any other value that JavaScript considers false, the content will not be rendered.

```html
<hello-world>
	Hello{{# name }} {{ . }}{{/ name }}!
</hello-world>
```

Use the inverted section tag to display content when the value is falsey.

```html
<scoped-view>
	{{^ data }}
		displayed when there is no data
	{{/ data }}
</scoped-view>
```

If the value at the section path is a non-empty list, the section is rendered for each item in the list. The context of the block will be set to the current item for each iteration. In this way we can loop over collections.

```html
<todo-list>
	<ul>
	{{# items }}
		<li>{{ . }}</li>
	{{/ items }}
	</ul>
</todo-list>
```

Just like variables, sections can be specified in attributes. Sections, however, will not work in decorated attributes.

```html
<my-template class="container {{^large}}container-small{{/large}}">
	<div style="{{#styles}}{{key}}: {{value}}; {{/styles}}">
		An element with dynamic styles.
	</div>
</my-template>
```

## Partials

Partials are blocks of template that can be rendered many times, across many views. To render a partial by name, use the `>` tag.

```html
<my-view>
	{{> named-partial }}
</my-view>
```

Similar to variables, the partial name is searched for in the partial context stack. If it isn't found there, the global partial list is checked instead. There is no special syntax for the partial name, the exact string is used in the search.

If you want to scope the lookup to just the local view, use the `$` tag instead. This is to prevent crossing wires when views share the same partial names, or a view is rendered within itself.

```html
<my-view>
	{{$ local-partial }}
</my-view>
```

Partials can be defined in the root of a view with the `%` tag. This partial is available to the local view, as well as any children views. It is important to note that partials are rendered with the same data context they are used, not defined.

```html
<my-view>
	{{$ hello }}

	{{% hello }}
	<h1>Hello {{ name }}</h1>
	{{/ hello }}
</my-view>
```

In extended views, use the special `@super` partial to render the parent's template. This allows the parent template to be wrapped or scoped before being rendered.

```html
<hello-world>Hello World</hello-world>

<super-hello-world extends="hello-world">
	<strong>{{> @super }}</strong>
</super-hello-world>
```

Partials are particularly powerful for extended views because views can override inherited partials.

```html
<my-view>
	<!-- my-view's template content -->
	<h1>{{$ content }}</h1>

	<!-- default content partial -->
	{{% content }}
	This is some content.
	{{/ content }}
</my-view>

<other-view extends="my-view">
	<!-- renders my-view -->
	{{> @super }}

	<!-- replaces content partial defined in my-view -->
	{{% content }}
	Overriding my-view content.
	{{/ content }}
</other-view>
```

The other special partial is the `@body` partial, whose content is passed to the view from the calling template. Keep in mind that the template is rendered in a data context chosen by the view, which is usually a different data context then where it is defined.

```html
<my-view>
	<hello-world>
		<strong>World</strong>
	</hello-world>
</my-view>

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
