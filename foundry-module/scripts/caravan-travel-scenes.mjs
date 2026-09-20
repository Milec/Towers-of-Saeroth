import { createHash } from "node:crypto";

// Traced against the two original 1254 x 1254 ImageGen rasters. Scene scale
// stays identical to the original ambush: matching wagons, 160ft square.
const moduleId = "saeroth-pf2e-content";
const levelId = "defaultLevel0000";
function makeScene(slug, name, size, night) {
  const id = key => createHash("sha256").update(`${slug}:${key}`).digest("hex").slice(0, 16);
  const px = value => Math.round(value * size / 1254);
  const asset = `assets/maps/${slug}.png`;
  const scene = {
    _id: id("scene"), name, active: false, navigation: false, navOrder: 0,
    width: size, height: size, padding: 0, shiftX: 0, shiftY: 0,
    initial: { x: size / 2, y: size / 2, scale: .4 }, initialLevel: levelId,
    thumb: `modules/${moduleId}/${asset}`,
    grid: { type: 1, size: 100, distance: 5, units: "ft", alpha: .15,
      color: "#b8b0a0", style: "solidLines", thickness: 1 },
    tokenVision: true,
    environment: { darknessLevel: night ? .75 : 0, darknessLock: true, cycle: false,
      globalLight: { enabled: !night, bright: !night, darkness: { min: 0, max: 1 } } },
    levels: [{ _id: levelId, name: night ? "Camp" : "Road",
      elevation: { bottom: null, top: null },
      background: { src: `modules/${moduleId}/${asset}`, color: "#252820" },
      textures: { fit: "fill", scaleX: 1, scaleY: 1, anchorX: .5, anchorY: .5,
        offsetX: 0, offsetY: 0, rotation: 0 } }],
    walls: [], lights: [], tokens: [], notes: [], sounds: [], drawings: [], regions: [], tiles: [],
    ownership: { default: 0 }, flags: { saeroth: {
      setup: "Reusable caravan scene. No actors preplaced. Wagon sides block movement only; doors are tailgates or tent flaps. Boulders and canvas tent sides block sight/light. Trees, brush and cover are GM-adjudicated. Background wagons/tents are fixed artwork; no moving vehicles, roof cutaways, automated fire damage or terrain costs."
    } }
  };
  function polygon(label, points, opaque, gateEdge = -1) {
    function edge(a, b, key, door = false) {
      scene.walls.push({ _id: id(`${label}:${key}`), c: [...a, ...b].map(px),
        levels: [levelId], move: 20, sight: opaque ? 20 : 0,
        light: opaque ? 20 : 0, sound: 0, dir: 0, door: door ? 1 : 0, ds: 0,
        flags: { saeroth: { label: `${label}${door ? " entrance" : ""}` } } });
    }
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length];
      if (i !== gateEdge) return edge(a, b, i);
      const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      // A real opening in the center of the side, with fixed corners.
      edge(a, at(.25), `${i}-a`);
      edge(at(.25), at(.75), `${i}-door`, true);
      edge(at(.75), b, `${i}-b`);
    });
  }
  function light(label, x, y, bright = 20, dim = 40, fire = false) {
    scene.lights.push({ _id: id(label), name: label, x: px(x), y: px(y),
      elevation: fire ? 1 : 5, levels: [levelId], rotation: 0,
      walls: true, vision: false, hidden: false,
      config: { bright, dim, angle: 360, color: fire ? "#ff9b42" : "#ffbf72",
        alpha: .3, luminosity: .5, attenuation: .5,
        // Ready for evening on the road, without orange pools in daylight.
        darkness: { min: night ? 0 : .25, max: 1 },
        animation: { type: "torch", speed: fire ? 3 : 2, intensity: fire ? 4 : 2 } } });
  }
  return { scene, polygon, light, slug, asset };
}

export function buildTravelScenes() {
  const camp = makeScene("berruel-caravan-campsite", "Berruel Caravan — Woodland Campsite", 3200, true);
  camp.polygon("West wagon", [[286,550],[417,550],[417,635],[286,635]], false, 1);
  camp.polygon("Middle wagon", [[574,550],[700,550],[700,635],[574,635]], false, 1);
  camp.polygon("East wagon", [[866,550],[996,550],[996,635],[866,635]], false, 1);
  camp.polygon("Northwest tent", [[236,811],[328,731],[384,844],[291,890]], true, 2);
  camp.polygon("Northeast tent", [[901,818],[960,748],[1061,840],[1007,890]], true, 3);
  camp.polygon("Southwest tent", [[334,1003],[423,914],[478,1005],[398,1065]], true, 2);
  camp.polygon("Southeast tent", [[821,994],[877,910],[964,997],[910,1057]], true, 3);
  camp.polygon("Northwest boulder", [[465,117],[489,101],[518,105],[539,137],[512,158],[466,153]], true);
  camp.polygon("Northeast boulder", [[1068,145],[1091,128],[1109,136],[1122,175],[1107,193],[1071,182]], true);
  camp.polygon("Southwest boulder", [[303,301],[319,279],[340,276],[356,302],[348,330],[308,327]], true);
  camp.light("Campfire", 636, 895, 20, 40, true);
  camp.light("West wagon lantern", 425, 551);
  camp.light("Middle wagon lantern", 712, 551);
  camp.light("East wagon lantern", 1006, 551);

  const road = makeScene("berruel-caravan-road", "Berruel Caravan — Woodland Road", 3200, false);
  road.polygon("West wagon", [[286,550],[417,550],[417,635],[286,635]], false, 1);
  road.polygon("Middle wagon", [[574,550],[700,550],[700,635],[574,635]], false, 1);
  road.polygon("East wagon", [[866,550],[996,550],[996,635],[866,635]], false, 1);
  road.polygon("Northwest boulder", [[175,155],[207,133],[250,130],[266,151],[275,177],[257,204],[207,213],[174,191]], true);
  road.polygon("Northeast boulder", [[1001,198],[1023,186],[1056,183],[1080,203],[1096,235],[1080,266],[1035,254],[1000,232]], true);
  road.polygon("Southeast boulder", [[962,939],[988,915],[1025,902],[1054,905],[1067,934],[1052,962],[1017,983],[981,992],[959,969]], true);
  road.light("West wagon lantern", 425, 551);
  road.light("Middle wagon lantern", 712, 551);
  road.light("East wagon lantern", 1006, 551);
  return [camp, road];
}
