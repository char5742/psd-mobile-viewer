/**
 * Layer panel — builds and manages the bottom-sheet layer list UI.
 */

/** @typedef {{ visible: boolean, opacity: number }} LayerState */

export class LayerPanel {
  /**
   * @param {HTMLElement} listEl     - the scrollable container
   * @param {Function}   onStateChange - called when any layer state changes
   */
  constructor(listEl, onStateChange) {
    this.listEl = listEl;
    this.onStateChange = onStateChange;
    /** @type {Map<string, LayerState>} */
    this.state = new Map();
    this._selectedId = null;
  }

  /**
   * Build the layer list from parsed PSD layers.
   * @param {Array} layers - psd.layers (flat, top-to-bottom in PSD order)
   */
  build(layers) {
    this.state.clear();
    this.listEl.innerHTML = '';

    if (!layers || layers.length === 0) {
      this.listEl.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">No layers found</p>';
      return;
    }

    // Build state first
    const initState = (layer) => {
      const id = this._id(layer);
      this.state.set(id, {
        visible: !layer.isHidden,
        opacity: layer.opacity ?? 255,
      });
      if (layer.children) layer.children.forEach(initState);
    };
    layers.forEach(initState);

    // Render from top to bottom (display order)
    layers.forEach(layer => this._renderLayer(this.listEl, layer, 0));
  }

  _id(layer) {
    // Use the object reference as key stored via WeakMap isn't convenient;
    // use name + type combo. Not perfect but good enough for demos.
    return `${layer.name}__${layer.type}__${layer.left ?? 0}__${layer.top ?? 0}`;
  }

  _renderLayer(container, layer, depth) {
    const id = this._id(layer);
    const state = this.state.get(id) ?? { visible: true, opacity: 255 };
    const isGroup = layer.children && layer.children.length > 0;

    const row = document.createElement('div');
    row.dataset.layerId = id;
    row.className = 'layer-row';
    row.style.paddingLeft = `${0.5 + depth * 1.25}rem`;

    // Group expand toggle
    if (isGroup) {
      const toggle = document.createElement('button');
      toggle.className = 'layer-group-toggle open';
      toggle.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>`;
      row.appendChild(toggle);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'w-4 h-4 shrink-0';
      row.appendChild(spacer);
    }

    // Type icon
    const icon = document.createElement('span');
    icon.className = 'layer-icon';
    icon.innerHTML = this._typeIcon(layer);
    row.appendChild(icon);

    // Name
    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = layer.name || '(unnamed)';
    row.appendChild(name);

    // Visibility toggle
    const visBtn = document.createElement('button');
    visBtn.className = 'layer-vis-btn';
    visBtn.title = state.visible ? 'Hide layer' : 'Show layer';
    visBtn.innerHTML = state.visible ? this._eyeIcon() : this._eyeOffIcon();
    row.appendChild(visBtn);

    container.appendChild(row);

    // Children container
    let childContainer = null;
    if (isGroup) {
      childContainer = document.createElement('div');
      childContainer.className = 'layer-children';
      container.appendChild(childContainer);
      layer.children.forEach(child => this._renderLayer(childContainer, child, depth + 1));
    }

    // Opacity slider row
    const sliderRow = document.createElement('div');
    sliderRow.className = 'flex items-center gap-2 px-2 pb-1';
    sliderRow.style.paddingLeft = `${0.5 + depth * 1.25 + 2.5}rem`;

    const opLabel = document.createElement('span');
    opLabel.className = 'text-[10px] text-gray-500 w-6 shrink-0';
    opLabel.textContent = Math.round((state.opacity / 255) * 100) + '%';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '255';
    slider.value = String(state.opacity);
    slider.className = 'flex-1 h-1 accent-[#89b4fa] cursor-pointer';
    slider.title = 'Opacity';

    sliderRow.appendChild(opLabel);
    sliderRow.appendChild(slider);
    container.appendChild(sliderRow);

    // ── Event listeners ──────────────────────────────────────────

    // Select layer
    row.addEventListener('click', (e) => {
      if (e.target.closest('.layer-vis-btn') || e.target.closest('.layer-group-toggle')) return;
      this._select(id, layer);
    });

    // Visibility
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const s = this.state.get(id);
      s.visible = !s.visible;
      visBtn.innerHTML = s.visible ? this._eyeIcon() : this._eyeOffIcon();
      visBtn.title = s.visible ? 'Hide layer' : 'Show layer';
      row.classList.toggle('opacity-40', !s.visible);
      this.onStateChange(this.state);
    });

    // Opacity
    slider.addEventListener('input', () => {
      const s = this.state.get(id);
      s.opacity = parseInt(slider.value, 10);
      opLabel.textContent = Math.round((s.opacity / 255) * 100) + '%';
      this.onStateChange(this.state);
    });

    // Group collapse
    if (isGroup) {
      const toggleBtn = row.querySelector('.layer-group-toggle');
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = childContainer.style.display !== 'none';
        childContainer.style.display = open ? 'none' : '';
        toggleBtn.classList.toggle('open', !open);
      });
    }

    // Initial visual state
    if (!state.visible) row.classList.add('opacity-40');
  }

  _select(id, layer) {
    // Deselect previous
    if (this._selectedId) {
      this.listEl.querySelector(`[data-layer-id="${CSS.escape(this._selectedId)}"]`)
        ?.classList.remove('selected');
    }
    this._selectedId = id;
    this.listEl.querySelector(`[data-layer-id="${CSS.escape(id)}"]`)
      ?.classList.add('selected');

    this.onStateChange(this.state, layer);
  }

  _typeIcon(layer) {
    if (layer.children && layer.children.length > 0) {
      return `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>`;
    }
    if (layer.type === 'Layer' && layer.text) {
      return `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h6m-6 4h10M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z"/></svg>`;
    }
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
  }

  _eyeIcon() {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>`;
  }

  _eyeOffIcon() {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>`;
  }
}
