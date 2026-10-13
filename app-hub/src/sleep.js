// Which app tabs to put to sleep: hidden ones not seen for `after` ms, and the least recently seen
// hidden ones while more than `max` are awake. The shown tab and tabs playing sound never sleep.
function toSleep(ids, { shown, lastSeen, audible = () => false, now, max = 5, after = 10 * 60000 }) {
  const hidden = ids.filter((id) => id !== shown && !audible(id))
    .sort((a, b) => (lastSeen.get(a) || 0) - (lastSeen.get(b) || 0));
  let extra = ids.length - max;
  return hidden.filter((id) => extra-- > 0 || now - (lastSeen.get(id) || 0) >= after);
}

module.exports = { toSleep };
