t.ok(Temple.getByName("a-tpl") instanceof Temple.Template, "creates a template object");

var frag = document.createDocumentFragment();
Temple.paint("a-tpl", frag);

t.equal(frag.childNodes.length, 1, "has one node in view");
t.equal(frag.firstChild.nodeType, document.TEXT_NODE, "has text node");
t.equal(frag.firstChild.nodeValue, "Hello World", "has correct value");
