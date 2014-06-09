window.MustacheTestContent = ({
	"ampersand_escape": {
		"js": "({\n  message: \"Some <code>\"\n})\n",
		"mustache": "{{&message}}\n",
		"txt": "Some <code></code>\n"
	},
	"array_of_strings": {
		"js": "({\n  array_of_strings: ['hello', 'world']\n})\n",
		"mustache": "{{#array_of_strings}}{{.}} {{/array_of_strings}}\n",
		"txt": "hello world \n"
	},
	"bug_11_eating_whitespace": {
		"js": "({\n  tag: \"yo\"\n})\n",
		"mustache": "{{tag}} foo\n",
		"txt": "yo foo\n"
	},
	"changing_delimiters": {
		"js": "({\n  \"foo\": \"foooooooooooooo\",\n  \"bar\": \"<b>bar!</b>\"\n})\n",
		"mustache": "{{=<% %>=}}<% foo %> {{foo}} <%{bar}%> {{{bar}}}\n",
		"txt": "foooooooooooooo {{foo}} <b>bar!</b> {{{bar}}}\n"
	},
	"check_falsy": {
		"js": "({\n  number: function(text, render) {\n    return function(text, render) {\n      return +render(text);\n    }\n  }\n})\n",
		"mustache": "<p>{{#number}}0{{/number}}</p>\n",
		"txt": "<p>0</p>\n"
	},
	"comments": {
		"js": "({\n  title: function () {\n    return \"A Comedy of Errors\";\n  }\n})\n",
		"mustache": "<h1>{{title}}{{! just something interesting... or not... }}</h1>\n",
		"txt": "<h1>A Comedy of Errors</h1>\n"
	},
	"complex": {
		"js": "({\n  header: function () {\n    return \"Colors\";\n  },\n  item: [\n      {name: \"red\", current: true, url: \"#Red\"},\n      {name: \"green\", current: false, url: \"#Green\"},\n      {name: \"blue\", current: false, url: \"#Blue\"}\n  ],\n  link: function () {\n    console.log(this);\n    return this.get(\"current\") !== true;\n  },\n  list: function () {\n    return this.get(\"item.length\") !== 0;\n  },\n  empty: function () {\n    return this.get(\"item.length\") === 0;\n  }\n})\n",
		"mustache": "<h1>{{header}}</h1>\n{{#list}}\n  <ul>\n  {{#item}}\n  {{#current}}\n  <li><strong>{{name}}</strong></li>\n  {{/current}}\n  {{#link}}\n  <li><a href=\"{{url}}\">{{name}}</a></li>\n  {{/link}}\n  {{/item}}\n  </ul>\n{{/list}}\n{{#empty}}\n  <p>The list is empty.</p>\n{{/empty}}\n",
		"txt": "<h1>Colors</h1>\n  <ul>\n  <li><strong>red</strong></li>\n  <li><a href=\"#Green\">green</a></li>\n  <li><a href=\"#Blue\">blue</a></li>\n  </ul>\n"
	},
	"context_lookup": {
		"js": "({\n  \"outer\": {\n    \"id\": 1,\n    \"second\": {\n      \"nothing\": 2\n    }\n  }\n})\n",
		"mustache": "{{#outer}}{{#second}}{{id}}{{/second}}{{/outer}}\n",
		"txt": "1\n"
	},
	"delimiters": {
		"js": "({\n  first: \"It worked the first time.\",\n  second: \"And it worked the second time.\",\n  third: \"Then, surprisingly, it worked the third time.\",\n  fourth: \"Fourth time also fine!.\"\n})\n",
		"mustache": "{{=<% %>=}}*\n<% first %>\n* <% second %>\n<%=| |=%>\n* | third |\n|={{ }}=|\n* {{ fourth }}\n",
		"txt": "*\nIt worked the first time.\n* And it worked the second time.\n* Then, surprisingly, it worked the third time.\n* Fourth time also fine!.\n"
	},
	"disappearing_whitespace": {
		"js": "({\n  bedrooms: true,\n  total: 1\n})\n",
		"mustache": "{{#bedrooms}}{{total}}{{/bedrooms}} BED\n",
		"txt": "1 BED\n"
	},
	"dot_notation": {
		"js": "({\n  name: \"A Book\",\n  authors: [\"John Power\", \"Jamie Walsh\"],\n  price: {\n    value: 200,\n    vat: function () {\n      return this.get(\"value\") * 0.2;\n    },\n    currency: {\n      symbol: '$',\n      name: 'USD'\n    }\n  },\n  availability: {\n    status: true,\n    text: \"In Stock\"\n  },\n  // And now, some truthy false values\n  truthy: {\n    zero: 0,\n    notTrue: false\n  }\n})\n",
		"mustache": "<!-- exciting part -->\n<h1>{{name}}</h1>\n<p>Authors: <ul>{{#authors}}<li>{{.}}</li>{{/authors}}</ul></p>\n<p>Price: {{{price.currency.symbol}}}{{price.value}} {{#price.currency}}{{name}} <b>{{availability.text}}</b>{{/price.currency}}</p>\n<p>VAT: {{{price.currency.symbol}}}{{#price}}{{vat}}{{/price}}</p>\n<!-- boring part -->\n<h2>Test truthy false values:</h2>\n<p>Zero: {{truthy.zero}}</p>\n<p>False: {{truthy.notTrue}}</p>\n",
		"txt": "\n<h1>A Book</h1>\n<p>Authors: <ul><li>John Power</li><li>Jamie Walsh</li></ul></p>\n<p>Price: $200 USD <b>In Stock</b></p>\n<p>VAT: $40</p>\n\n<h2>Test truthy false values:</h2>\n<p>Zero: 0</p>\n<p>False: false</p>\n"
	},
	"double_render": {
		"js": "({\n  foo: true,\n  bar: \"{{win}}\",\n  win: \"FAIL\"\n})\n",
		"mustache": "{{#foo}}{{bar}}{{/foo}}\n",
		"txt": "{{win}}\n"
	},
	"empty_list": {
		"js": "({\n  jobs: []\n})\n",
		"mustache": "These are the jobs:\n{{#jobs}}\n{{.}}\n{{/jobs}}\n",
		"txt": "These are the jobs:\n"
	},
	"empty_sections": {
		"js": "({})\n",
		"mustache": "{{#foo}}{{/foo}}foo{{#bar}}{{/bar}}\n",
		"txt": "foo\n"
	},
	"empty_string": {
		"js": "({\n  description: \"That is all!\",\n  child: {\n    description: \"\"\n  }\n})\n",
		"mustache": "{{description}}{{#child}}{{description}}{{/child}}\n",
		"txt": "That is all!\n"
	},
	"empty_template": {
		"js": "({})\n",
		"mustache": "<html><head></head><body><h1>Test</h1></body></html>",
		"txt": "<html><head></head><body><h1>Test</h1></body></html>"
	},
	"error_not_found": {
		"js": "({\n  bar: 2\n})\n",
		"mustache": "{{foo}}",
		"txt": ""
	},
	"falsy": {
		"js": "({\n  \"emptyString\": \"\",\n  \"emptyArray\": [],\n  \"zero\": 0,\n  \"null\": null,\n  \"undefined\": undefined,\n  \"NaN\": 0/0\n})",
		"mustache": "{{#emptyString}}empty string{{/emptyString}}\n{{^emptyString}}inverted empty string{{/emptyString}}\n{{#emptyArray}}empty array{{/emptyArray}}\n{{^emptyArray}}inverted empty array{{/emptyArray}}\n{{#zero}}zero{{/zero}}\n{{^zero}}inverted zero{{/zero}}\n{{#null}}null{{/null}}\n{{^null}}inverted null{{/null}}\n{{#undefined}}undefined{{/undefined}}\n{{^undefined}}inverted undefined{{/undefined}}\n{{#NaN}}NaN{{/NaN}}\n{{^NaN}}inverted NaN{{/NaN}}\n",
		"txt": "\ninverted empty string\n\ninverted empty array\n\ninverted zero\n\ninverted null\n\ninverted undefined\n\ninverted NaN\n"
	},
	"grandparent_context": {
		"js": "({\n  grand_parent_id: 'grand_parent1',\n  parent_contexts: [\n    {\n      parent_id: 'parent1',\n      child_contexts: [\n        { child_id: 'parent1-child1' },\n        { child_id: 'parent1-child2' }\n      ]\n    },\n    {\n      parent_id: 'parent2',\n      child_contexts: [\n        { child_id: 'parent2-child1' },\n        { child_id: 'parent2-child2' }\n      ]\n    }\n  ]\n})\n",
		"mustache": "{{grand_parent_id}}\n{{#parent_contexts}}\n{{grand_parent_id}}\n{{parent_id}}\n{{#child_contexts}}\n{{grand_parent_id}}\n{{parent_id}}\n{{child_id}}\n{{/child_contexts}}\n{{/parent_contexts}}\n",
		"txt": "grand_parent1\ngrand_parent1\nparent1\ngrand_parent1\nparent1\nparent1-child1\ngrand_parent1\nparent1\nparent1-child2\ngrand_parent1\nparent2\ngrand_parent1\nparent2\nparent2-child1\ngrand_parent1\nparent2\nparent2-child2\n"
	},
	"included_tag": {
		"js": "({\n  html: \"I like {{mustache}}\"\n})\n",
		"mustache": "You said \"{{{html}}}\" today\n",
		"txt": "You said \"I like {{mustache}}\" today\n"
	},
	"inverted_section": {
		"js": "({\n  \"repos\": []\n})\n",
		"mustache": "{{#repos}}<b>{{name}}</b>{{/repos}}\n{{^repos}}No repos :({{/repos}}\n{{^nothin}}Hello!{{/nothin}}\n",
		"txt": "\nNo repos :(\nHello!\n"
	},
	"keys_with_questionmarks": {
		"js": "({\n  \"person?\": {\n    name: \"Jon\"\n  }\n})\n",
		"mustache": "{{#person?}}\n  Hi {{name}}!\n{{/person?}}\n",
		"txt": "  Hi Jon!\n"
	},
	"malicious_template": {
		"js": "({})\n",
		"mustache": "{{\"+(function () {throw \"evil\"})()+\"}}\n{{{\"+(function () {throw \"evil\"})()+\"}}}\n{{> \"+(function () {throw \"evil\"})()+\"}}\n{{# \"+(function () {throw \"evil\"})()+\"}}\n{{/ \"+(function () {throw \"evil\"})()+\"}}\n",
		"txt": "\n\n"
	},
	"multiline_comment": {
		"js": "({})\n",
		"mustache": "{{!\n\nThis is a multi-line comment.\n\n}}\nHello world!\n",
		"txt": "Hello world!\n"
	},
	"nested_dot": {
		"js": "({ name: 'Bruno' })\n",
		"mustache": "{{#name}}Hello {{.}}{{/name}}",
		"txt": "Hello Bruno"
	},
	"nested_iterating": {
		"js": "({\n  inner: [{\n    foo: 'foo',\n    inner: [{\n      bar: 'bar'\n    }]\n  }]\n})\n",
		"mustache": "{{#inner}}{{foo}}{{#inner}}{{bar}}{{/inner}}{{/inner}}\n",
		"txt": "foobar\n"
	},
	"nesting": {
		"js": "({\n  foo: [\n    {a: {b: 1}},\n    {a: {b: 2}},\n    {a: {b: 3}}\n  ]\n})\n",
		"mustache": "{{#foo}}\n  {{#a}}\n    {{b}}\n  {{/a}}\n{{/foo}}\n",
		"txt": "    1\n    2\n    3\n"
	},
	"nesting_same_name": {
		"js": "({\n  items: [\n    {\n      name: 'name',\n      items: [1, 2, 3, 4]\n    }\n  ]\n})\n",
		"mustache": "{{#items}}{{name}}{{#items}}{{.}}{{/items}}{{/items}}\n",
		"txt": "name1234\n"
	},
	"null_string": {
		"js": "({\n  name: \"Elise\",\n  glytch: true,\n  binary: false,\n  value: null,\n  undef: undefined,\n  numeric: function() {\n    return NaN;\n  }\n})\n",
		"mustache": "Hello {{name}}\nglytch {{glytch}}\nbinary {{binary}}\nvalue {{value}}\nundef {{undef}}\nnumeric {{numeric}}\n",
		"txt": "Hello Elise\nglytch true\nbinary false\nvalue \nundef \nnumeric NaN\n"
	},
	"null_view": {
		"js": "({\n  name: 'Joe',\n  friends: null\n})\n",
		"mustache": "{{name}}'s friends: {{#friends}}{{name}}, {{/friends}}",
		"txt": "Joe's friends: "
	},
	"partial_empty": {
		"js": "({\n  foo: 1\n})\n",
		"mustache": "hey {{foo}}\n{{>partial}}\n",
		"partial": "",
		"txt": "hey 1\n"
	},
	"recursion_with_same_names": {
		"js": "({\n  name: 'name',\n  description: 'desc',\n  terms: [\n    {name: 't1', index: 0},\n    {name: 't2', index: 1}\n  ]\n})\n",
		"mustache": "{{ name }}\n{{ description }}\n\n{{#terms}}\n  {{name}}\n  {{index}}\n{{/terms}}\n",
		"txt": "name\ndesc\n\n  t1\n  0\n  t2\n  1\n"
	},
	"reuse_of_enumerables": {
		"js": "({\n  terms: [\n    {name: 't1', index: 0},\n    {name: 't2', index: 1}\n  ]\n})\n",
		"mustache": "{{#terms}}\n  {{name}}\n  {{index}}\n{{/terms}}\n{{#terms}}\n  {{name}}\n  {{index}}\n{{/terms}}\n",
		"txt": "  t1\n  0\n  t2\n  1\n  t1\n  0\n  t2\n  1\n"
	},
	"section_as_context": {
		"js": "({\n  a_object: {\n    title: 'this is an object',\n    description: 'one of its attributes is a list',\n    a_list: [\n      {label: 'listitem1'},\n      {label: 'listitem2'}\n    ]\n  }\n})\n",
		"mustache": "{{#a_object}}\n  <h1>{{title}}</h1>\n  <p>{{description}}</p>\n  <ul>\n    {{#a_list}}\n    <li>{{label}}</li>\n    {{/a_list}}\n  </ul>\n{{/a_object}}\n",
		"txt": "  <h1>this is an object</h1>\n  <p>one of its attributes is a list</p>\n  <ul>\n    <li>listitem1</li>\n    <li>listitem2</li>\n  </ul>\n"
	},
	"simple": {
		"js": "({\n  name: \"Chris\",\n  value: 10000,\n  taxed_value: function (tpl, ctx) {\n  \tvar val = tpl.get(\"value\");\n    return val - (val * 0.4);\n  },\n  in_ca: true\n})\n",
		"mustache": "Hello {{name}}\nYou have just won ${{value}}!\n{{#in_ca}}\nWell, ${{ taxed_value }}, after taxes.\n{{/in_ca}}\n",
		"txt": "Hello Chris\nYou have just won $10000!\nWell, $6000, after taxes.\n"
	},
	"string_as_context": {
		"js": "({\n  a_string: 'aa',\n  a_list: ['a','b','c']\n})\n",
		"mustache": "<ul>\n{{#a_list}}\n  <li>{{a_string}}/{{.}}</li>\n{{/a_list}}\n</ul>",
		"txt": "<ul>\n  <li>aa/a</li>\n  <li>aa/b</li>\n  <li>aa/c</li>\n</ul>"
	},
	"two_in_a_row": {
		"js": "({\n  name: \"Joe\",\n  greeting: \"Welcome\"\n})\n",
		"mustache": "{{greeting}}, {{name}}!\n",
		"txt": "Welcome, Joe!\n"
	},
	"two_sections": {
		"js": "({})\n",
		"mustache": "{{#foo}}\n{{/foo}}\n{{#bar}}\n{{/bar}}\n",
		"txt": ""
	},
	"whitespace": {
		"js": "({\n  tag1: \"Hello\",\n  tag2: \"World\"\n})\n",
		"mustache": "{{tag1}}\n\n\n{{tag2}}.\n",
		"txt": "Hello\n\n\nWorld.\n"
	},
	"zero_view": {
		"js": "({ nums: [0, 1, 2] })\n",
		"mustache": "{{#nums}}{{.}},{{/nums}}",
		"txt": "0,1,2,"
	}
});