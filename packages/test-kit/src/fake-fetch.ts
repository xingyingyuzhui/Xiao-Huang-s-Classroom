/** Fake Fetch：按 URL 路由的响应注入（可断言请求记录）。 */
export interface FetchRequest {
  url: string;
  init: RequestInit | undefined;
}

export interface FakeFetch {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  respond(urlPattern: RegExp, response: () => Response): void;
  requests(): FetchRequest[];
  reset(): void;
}

export function createFakeFetch(): FakeFetch {
  const routes: Array<{ pattern: RegExp; response: () => Response }> = [];
  const requests: FetchRequest[] = [];
  return {
    async fetch(input, init) {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : String(input.url);
      requests.push({ url, init });
      const route = routes.find((r) => r.pattern.test(url));
      if (!route)
        return new Response('{"error":"not found"}', {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      return route.response();
    },
    respond(pattern, response) {
      routes.push({ pattern, response });
    },
    requests() {
      return [...requests];
    },
    reset() {
      requests.length = 0;
    },
  };
}
