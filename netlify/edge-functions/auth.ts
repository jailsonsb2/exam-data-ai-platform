/* Basic Auth na borda da Netlify.
 *
 * Roda ANTES de qualquer arquivo ser entregue, inclusive dados/questoes.json e
 * os recortes de PDF — que é o ponto: uma senha em JavaScript no navegador
 * protegeria só a tela, e o banco de questões continuaria baixável pela URL.
 *
 * Usuário e senha vêm das variáveis de ambiente SITE_USER e SITE_PASS,
 * configuradas no painel da Netlify (Site configuration › Environment
 * variables). Nunca no repositório.
 */

const REALM = "Treino Concursos";

/** Comparação em tempo constante: não vaza o tamanho nem o prefixo correto. */
function iguais(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let dif = ba.length ^ bb.length;
  const n = Math.max(ba.length, bb.length);
  for (let i = 0; i < n; i++) {
    dif |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return dif === 0;
}

function pedirSenha(): Response {
  return new Response("Acesso restrito.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const usuario = Deno.env.get("SITE_USER");
  const senha = Deno.env.get("SITE_PASS");

  // sem credenciais configuradas o site fica fechado de propósito: melhor
  // avisar do que servir as provas abertas por um descuido de configuração
  if (!usuario || !senha) {
    return new Response(
      "Site sem credenciais configuradas. Defina SITE_USER e SITE_PASS nas " +
      "variáveis de ambiente da Netlify e refaça o deploy.",
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cabecalho = request.headers.get("Authorization") || "";
  if (!cabecalho.startsWith("Basic ")) return pedirSenha();

  let decodificado: string;
  try {
    decodificado = atob(cabecalho.slice(6));
  } catch {
    return pedirSenha();
  }

  // a senha pode conter ":", então só o primeiro separador conta
  const corte = decodificado.indexOf(":");
  if (corte < 0) return pedirSenha();

  const okUsuario = iguais(decodificado.slice(0, corte), usuario);
  const okSenha = iguais(decodificado.slice(corte + 1), senha);
  if (!okUsuario || !okSenha) return pedirSenha();

  return context.next();
};

export const config = { path: "/*" };
