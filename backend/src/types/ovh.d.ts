declare module "ovh" {
  type Callback = (error: unknown, result: unknown) => void;

  interface OvhClient {
    requestPromised(method: string, path: string, params?: Record<string, unknown>): Promise<unknown>;
    request(method: string, path: string, params: Record<string, unknown>, callback: Callback): void;
  }

  type OvhOptions = {
    endpoint: string;
    appKey: string;
    appSecret: string;
    consumerKey: string;
  };

  export default function ovh(options: OvhOptions): OvhClient;
}
