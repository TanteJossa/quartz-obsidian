# Obsidget Test Page

This is a test of the `obsidget` plugin for Quartz.

## Simple Counter Widget

```widget
counter-widget
---
<div class="counter-container">
  <h3>Counter: <span id="count-val">0</span></h3>
  <button id="inc-btn">Increment</button>
  <button id="dec-btn">Decrement</button>
</div>
---
.counter-container {
  border: 1px solid var(--lightgray);
  padding: 1rem;
  border-radius: 5px;
  background-color: var(--light);
}
h3 { margin-top: 0; }
button {
  padding: 0.5rem 1rem;
  cursor: pointer;
  background-color: var(--secondary);
  color: var(--light);
  border: none;
  border-radius: 3px;
}
button:hover { opacity: 0.8; }
---
const countVal = api.root.getElementById('count-val');
const incBtn = api.root.getElementById('inc-btn');
const decBtn = api.root.getElementById('dec-btn');

function updateUI() {
  countVal.innerText = api.state.count;
}

incBtn.addEventListener('click', () => {
  api.setState({ count: api.state.count + 1 });
  updateUI();
});

decBtn.addEventListener('click', () => {
  api.setState({ count: api.state.count - 1 });
  updateUI();
});

// Initial UI sync
updateUI();
---
{ "count": 0 }
```

## Another Widget

```widget
hello-widget
---
<p id="msg"></p>
---
#msg { font-weight: bold; color: var(--tertiary); }
---
api.root.getElementById('msg').innerText = "Hello, " + api.state.name + "!";
---
{ "name": "Quartz User" }
```
