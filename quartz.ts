import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { componentRegistry } from "./quartz/components/registry"

// Explorer order matches the homepage (content/index.md) Contents list.
// sortFn is serialized via toString() and rebuilt in the browser with `new Function`,
// so the body must not depend on build helpers (esbuild's __name). Build the
// comparator from a string so the shipped toString() stays self-contained.
const explorerSortFn = new Function(
  "a",
  "b",
  `
  var order = [
    "start here",
    "where i stand",
    "1. ethical and philosophical framework",
    "2. political and social character",
    "3. authority & civil liberties",
    "4. religion & secularism",
    "5. domestic policy & governance",
    "6. criminal justice & security",
    "7. cultural & social issues",
    "8. foreign policy & international relations",
    "9. energy & environment",
    "10. bioethics, progress, & technology",
    "11. modern political parties",
    "12. current administration",
    "13. news commentary",
    "glossary"
  ];
  function rank(n) {
    var raw = String(n.displayName || n.slugSegment || "")
      .replace(/\\.md$/i, "")
      .trim()
      .toLowerCase();
    var i = order.indexOf(raw);
    if (i >= 0) return i;
    var seg = String(n.slugSegment || "").toLowerCase().replace(/-/g, " ");
    var j = order.indexOf(seg);
    if (j >= 0) return j;
    var m = raw.match(/^(\\d+)\\./);
    if (m) {
      var k = Number(m[1]);
      if (k >= 1 && k <= 13) return k + 1;
    }
    return 1000;
  }
  var d = rank(a) - rank(b);
  if (d !== 0) return d;
  return String(a.displayName || "").localeCompare(String(b.displayName || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
  `,
) as (a: any, b: any) => number

const explorerOverrides = { sortFn: explorerSortFn }
componentRegistry.setOptionOverrides("@quartz-community/explorer", explorerOverrides)
componentRegistry.setOptionOverrides("explorer", explorerOverrides)

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
