import { redirect } from "next/navigation";

// No Netlify, "/" já é redirecionado para /dashboard/ (netlify.toml);
// isto cobre o `next dev` e outros hosts estáticos.
export default function Home() {
  redirect("/dashboard/");
}
