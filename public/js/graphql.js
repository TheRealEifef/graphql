const GRAPHQL_URL = "https://learn.reboot01.com/api/graphql-engine/v1/graphql";

async function fetchGraphQL(query, variables = {}) {
  const token = localStorage.getItem("jwt");
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) throw new Error("GraphQL network error");
  const { data, errors } = await res.json();
  if (errors) throw new Error(errors.map(e => e.message).join("\n"));
  return data;
}

window.fetchGraphQL = fetchGraphQL;