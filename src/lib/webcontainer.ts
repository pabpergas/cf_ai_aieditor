import { WebContainer } from '@webcontainer/api';

let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

export async function getWebContainer(): Promise<WebContainer> {
  if (webcontainerInstance) {
    return webcontainerInstance;
  }

  // If already booting, wait for the existing boot to complete
  if (bootPromise) {
    return bootPromise;
  }

  // Start booting
  bootPromise = WebContainer.boot();
  webcontainerInstance = await bootPromise;
  bootPromise = null;

  return webcontainerInstance;
}

export async function mountProjectFiles(
  projectId: string,
  files: Array<{ path: string; content: string; type: 'file' | 'directory' }>
): Promise<void> {
  const container = await getWebContainer();

  // Create directory structure
  const fileTree: any = {};

  for (const file of files) {
    const pathParts = file.path.split('/');
    let current = fileTree;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isLast = i === pathParts.length - 1;

      if (isLast) {
        if (file.type === 'file') {
          current[part] = {
            file: {
              contents: file.content
            }
          };
        } else {
          current[part] = { directory: {} };
        }
      } else {
        if (!current[part]) {
          current[part] = { directory: {} };
        }
        current = current[part].directory;
      }
    }
  }

  await container.mount(fileTree);
}

export async function runCommand(
  command: string,
  args: string[] = [],
  onOutput?: (output: string) => void
): Promise<number> {
  const container = await getWebContainer();

  const process = await container.spawn(command, args);

  process.output.pipeTo(
    new WritableStream({
      write(data) {
        onOutput?.(data);
      }
    })
  );

  return await process.exit;
}

export async function startDevServer(
  onOutput?: (output: string) => void,
  onServerReady?: (url: string) => void
): Promise<void> {
  const container = await getWebContainer();

  // Start dev server
  const process = await container.spawn('npm', ['run', 'dev']);

  process.output.pipeTo(
    new WritableStream({
      write(data) {
        onOutput?.(data);
      }
    })
  );

  // Wait for server to be ready
  container.on('server-ready', (port, url) => {
    onServerReady?.(url);
  });
}
