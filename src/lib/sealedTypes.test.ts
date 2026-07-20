import {
  isPreorderRadarEligible,
  isUpcomingSet,
  releaseBucket,
} from "./sealedTypes";

const july20 = new Date("2026-07-20T12:00:00Z");

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  releaseBucket("2026-06-26", july20) === "released",
  "Marvel should be released by mid-July (past the 14-day window)",
);
assert(
  !isPreorderRadarEligible("2026-06-26", july20),
  "Marvel must not appear on Preorder Radar after street date",
);
assert(
  isPreorderRadarEligible("2026-08-14", july20),
  "Hobbit should stay on Preorder Radar before Aug 14",
);
assert(isUpcomingSet("2026-10-02", july20), "Reality Fracture is upcoming");
assert(
  releaseBucket("2026-11-20", july20) === "preorder",
  "Star Trek release date should bucket as preorder",
);

console.log("sealedTypes.test.ts passed");
