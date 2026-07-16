import { ensureCatalogSeeded } from "@/lib/pricing/service";
import {
  seedInitialPreorders,
  startPreorderWatcher,
} from "@/lib/watcher/preorderWatcher";

const globalBoot = globalThis as unknown as { __mtgBooted?: boolean };

export async function bootstrapApp() {
  if (globalBoot.__mtgBooted) return;
  globalBoot.__mtgBooted = true;
  await ensureCatalogSeeded();
  await seedInitialPreorders();
  await startPreorderWatcher();
}
