

Once rendered, a Temple view instance is reactive: changes to data will automatically rerender the DOM nodes. This process is controlled by an invalidation cycle that happens at most every animation frame. The rendering engine is decently effecient and will rerender the minimum parts necessary to ensure the interface is up-to-date.