({
  header: function () {
    return "Colors";
  },
  item: [
      {name: "red", current: true, url: "#Red"},
      {name: "green", current: false, url: "#Green"},
      {name: "blue", current: false, url: "#Blue"}
  ],
  link: function () {
    console.log(this);
    return this.get("current") !== true;
  },
  list: function () {
    return this.get("item.length") !== 0;
  },
  empty: function () {
    return this.get("item.length") === 0;
  }
})
