export function errorMessage(error: {
  message?: string;
  code?: string;
}): string {
  const message = error.message ?? "";
  if (/anonymous.*(disabled|not allowed)/i.test(message))
    return "El proyecto todavía no permite sesiones anónimas. Activá Anonymous Sign-Ins en Supabase.";
  if (/fetch|network|offline|timeout|abort/i.test(message))
    return "No pudimos conectar con Supabase. Revisá tu conexión y volvé a intentar.";
  if (
    error.code === "23514" ||
    error.code === "23502" ||
    error.code === "22P02"
  )
    return "Revisá los datos: hay un campo vacío, inválido o fuera de los límites permitidos.";
  if (error.code === "42501")
    return "Tu sesión no tiene permiso para esta operación. Volvé a abrir el enlace completo.";
  if (
    error.code === "PGRST202" ||
    /function .* does not exist|schema cache/i.test(message)
  )
    return "Falta aplicar la configuración de la base de datos. Revisá las migraciones de Supabase.";
  if (error.code === "P0001") return message; // Mensajes de las funciones SQL de Bizarrón.
  if (/JWT|token.*expired|session.*missing/i.test(message))
    return "La sesión venció. Recargá la página para volver a entrar.";
  return "No pudimos completar la operación. Reintentá en unos instantes.";
}
