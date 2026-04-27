/**
 * Touch handler — pinch-to-zoom, pan, double-tap-to-fit
 * Operates on a "viewport" transform: { x, y, scale }
 */
export class TouchHandler {
  /**
   * @param {HTMLElement} el  - element to attach touch events to
   * @param {object}      vp  - viewport state { x, y, scale }
   * @param {Function}    onUpdate - called when transform changes
   * @param {Function}    onFit    - called on double-tap to fit
   */
  constructor(el, vp, onUpdate, onFit) {
    this.el = el;
    this.vp = vp;
    this.onUpdate = onUpdate;
    this.onFit = onFit;

    this._touches = [];
    this._lastDist = 0;
    this._lastMid = null;
    this._lastTap = 0;
    this._isDragging = false;

    el.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: false });
    el.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
    el.addEventListener('touchend', this._onTouchEnd.bind(this), { passive: false });

    // Mouse support
    el.addEventListener('mousedown', this._onMouseDown.bind(this));
    el.addEventListener('mousemove', this._onMouseMove.bind(this));
    el.addEventListener('mouseup', this._onMouseUp.bind(this));
    el.addEventListener('wheel', this._onWheel.bind(this), { passive: false });
  }

  _dist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _mid(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  }

  _onTouchStart(e) {
    e.preventDefault();
    this._touches = Array.from(e.touches);

    if (this._touches.length === 2) {
      this._lastDist = this._dist(this._touches[0], this._touches[1]);
      this._lastMid = this._mid(this._touches[0], this._touches[1]);
    } else if (this._touches.length === 1) {
      this._lastMid = { x: this._touches[0].clientX, y: this._touches[0].clientY };

      // Double-tap detection
      const now = Date.now();
      if (now - this._lastTap < 300) {
        this.onFit();
        this._lastTap = 0;
        return;
      }
      this._lastTap = now;
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    this._touches = Array.from(e.touches);
    const rect = this.el.getBoundingClientRect();

    if (this._touches.length === 2) {
      const dist = this._dist(this._touches[0], this._touches[1]);
      const mid = this._mid(this._touches[0], this._touches[1]);

      const scaleRatio = dist / this._lastDist;
      const originX = mid.x - rect.left;
      const originY = mid.y - rect.top;

      this._applyScale(scaleRatio, originX, originY);

      // Pan component from mid-point movement
      if (this._lastMid) {
        this.vp.x += mid.x - this._lastMid.x;
        this.vp.y += mid.y - this._lastMid.y;
      }

      this._lastDist = dist;
      this._lastMid = mid;
    } else if (this._touches.length === 1 && this._lastMid) {
      const t = this._touches[0];
      this.vp.x += t.clientX - this._lastMid.x;
      this.vp.y += t.clientY - this._lastMid.y;
      this._lastMid = { x: t.clientX, y: t.clientY };
    }

    this.onUpdate();
  }

  _onTouchEnd(e) {
    e.preventDefault();
    this._touches = Array.from(e.touches);
    if (this._touches.length === 1) {
      this._lastMid = { x: this._touches[0].clientX, y: this._touches[0].clientY };
    } else if (this._touches.length === 0) {
      this._lastMid = null;
    } else {
      this._lastDist = this._dist(this._touches[0], this._touches[1]);
      this._lastMid = this._mid(this._touches[0], this._touches[1]);
    }
  }

  _onMouseDown(e) {
    this._isDragging = true;
    this._lastMid = { x: e.clientX, y: e.clientY };
  }

  _onMouseMove(e) {
    if (!this._isDragging || !this._lastMid) return;
    this.vp.x += e.clientX - this._lastMid.x;
    this.vp.y += e.clientY - this._lastMid.y;
    this._lastMid = { x: e.clientX, y: e.clientY };
    this.onUpdate();
  }

  _onMouseUp() {
    this._isDragging = false;
    this._lastMid = null;
  }

  _onWheel(e) {
    e.preventDefault();
    const rect = this.el.getBoundingClientRect();
    const originX = e.clientX - rect.left;
    const originY = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this._applyScale(delta, originX, originY);
    this.onUpdate();
  }

  _applyScale(ratio, originX, originY) {
    const MIN = 0.05;
    const MAX = 32;
    const newScale = Math.min(MAX, Math.max(MIN, this.vp.scale * ratio));
    const actualRatio = newScale / this.vp.scale;

    // Adjust x/y so the origin point stays fixed
    this.vp.x = originX + (this.vp.x - originX) * actualRatio;
    this.vp.y = originY + (this.vp.y - originY) * actualRatio;
    this.vp.scale = newScale;
  }
}
