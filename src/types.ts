export interface FileItem {
  name: string;
  isDirectory: boolean;
  path: string;
  size: number;
  modified?: string | Date;
}

export interface SystemSpecs {
  os: {
    platform: string;
    release: string;
    type: string;
    arch: string;
    hostname: string;
    uptime: string;
  };
  cpu: {
    model: string;
    cores: number;
    speed: string;
    loadAvg: number[];
  };
  memory: {
    total: string;
    free: string;
    used: string;
  };
  storage: string;
  shell: string;
  nodeVersion: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}
