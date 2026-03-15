import { connect } from "node:net";

const EMULATOR_CHECK_TIMEOUT_MS = 3000;

function isEmulatorReachable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: EMULATOR_CHECK_TIMEOUT_MS }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export default async function globalSetup(): Promise<void> {
  const hostEnv = process.env.FIRESTORE_EMULATOR_HOST;
  if (!hostEnv) return;
  const [host, portStr] = hostEnv.split(":");
  const port = portStr ? Number.parseInt(portStr, 10) : 8080;
  if (!host || Number.isNaN(port)) {
    throw new Error(`Invalid FIRESTORE_EMULATOR_HOST: "${hostEnv}". Use host:port (e.g. localhost:8080).`);
  }
  const reachable = await isEmulatorReachable(host, port);
  if (!reachable) {
    throw new Error(
      `Firestore emulator not reachable at ${host}:${port}. Start it with: firebase emulators:start --only firestore`,
    );
  }
}
