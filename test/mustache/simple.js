({
  name: "Chris",
  value: 10000,
  taxed_value: function (tpl, ctx) {
  	var val = tpl.get("value");
    return val - (val * 0.4);
  },
  in_ca: true
})
