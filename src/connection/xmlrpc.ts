import { URL } from "node:url";
import xmlrpc from "xmlrpc";

export interface XmlRpcClientOptions {
  url: string;
  path: string;
  timeout?: number;
  verifySsl?: boolean;
}

/**
 * Options for xmlrpc client (inline since @types/xmlrpc doesn't export it)
 */
interface InternalClientOptions {
  host: string;
  port: number;
  path: string;
  rejectUnauthorized?: boolean;
}

type XmlRpcClient_ = ReturnType<typeof xmlrpc.createClient>;

/**
 * XML-RPC client wrapper with timeout support
 */
export class XmlRpcClient {
  private client: XmlRpcClient_;
  private options: Required<XmlRpcClientOptions>;

  constructor(options: XmlRpcClientOptions) {
    this.options = {
      timeout: options.timeout ?? 30000,
      verifySsl: options.verifySsl ?? true,
      url: options.url,
      path: options.path,
    };

    this.client = this.createClient();
  }

  private createClient(): xmlrpc.Client {
    const parsedUrl = new URL(this.options.url);
    const isHttps = parsedUrl.protocol === "https:";

    const clientOptions: InternalClientOptions = {
      host: parsedUrl.hostname,
      port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : isHttps ? 443 : 80,
      path: this.options.path,
    };

    // Handle SSL verification
    if (isHttps && !this.options.verifySsl) {
      clientOptions.rejectUnauthorized = false;
    }

    return isHttps
      ? xmlrpc.createSecureClient(clientOptions)
      : xmlrpc.createClient(clientOptions);
  }

  /**
   * Make an XML-RPC method call with timeout
   */
  async methodCall<T>(method: string, params: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      this.client.methodCall(method, params, (error, value) => {
        clearTimeout(timeoutId);
        if (error) {
          reject(error);
        } else {
          resolve(value as T);
        }
      });
    });
  }
}
