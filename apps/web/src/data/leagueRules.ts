export type LeagueRuleSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export type LeagueRulesContent = {
  lastUpdated: string;
  featuredRule: {
    title: string;
    paragraphs: string[];
    bullets?: string[];
  };
  sections: LeagueRuleSection[];
};

const leagueRulesContent = {
  en: {
    lastUpdated: "2026-03-23",
    featuredRule: {
      title: "Playoff eligibility reminder",
      paragraphs: [
        "Players should meet the league's regular-season participation requirement before appearing in postseason games. This featured block is intentionally written as a placeholder so the official threshold and exception process can be inserted later without changing the page layout.",
      ],
      bullets: [
        "Confirm the minimum games played or scorebook appearances required for playoff eligibility.",
        "Clarify whether rainouts, suspended games, and makeup dates count toward the threshold.",
        "Record any commissioner-approved exceptions in writing before the playoff bracket is finalized.",
      ],
    },
    sections: [
      {
        id: "eligibility",
        title: "League Eligibility Rules",
        paragraphs: [
          "This section should explain who is eligible to register, what residency or age requirements apply, and whether players may participate in more than one league or division at the same time.",
          "If the league uses waivers, identification checks, or season registration deadlines, those items can be added here as separate paragraphs or bullet points.",
        ],
        bullets: [
          "List player age requirements and any age-based divisions.",
          "State whether proof of identity or residency is required.",
          "Note registration deadlines and any approval process for late additions.",
        ],
      },
      {
        id: "roster-lineup",
        title: "Roster and Lineup Rules",
        paragraphs: [
          "Use this section for active roster size, lineup card expectations, and player-add deadlines. It is also a good place to define how substitutes, courtesy runners, or designated hitters are handled.",
          "If lineup changes must be reported to the umpire or scorekeeper before first pitch, that process can be documented clearly here.",
        ],
        bullets: [
          "Define minimum and maximum roster sizes.",
          "Explain when a player must appear on the official lineup card.",
          "Describe any pickup-player restrictions or emergency roster rules.",
        ],
      },
      {
        id: "schedule-game-day",
        title: "Schedule and Game Day Rules",
        paragraphs: [
          "This section can cover start times, field access, rain-delay procedures, home and away responsibilities, and the process for reporting final scores after a game.",
          "If the league has a forfeit window, grace period, or weather postponement policy, those details fit naturally in this section.",
        ],
        bullets: [
          "Set expectations for check-in, warmups, and game-start readiness.",
          "Document who provides baseballs, scorebooks, and field setup support.",
          "Explain postponement, rescheduling, and score-reporting procedures.",
        ],
      },
      {
        id: "playoffs",
        title: "Playoff Rules",
        paragraphs: [
          "Use this section for seeding, tiebreakers, bracket structure, and roster-lock timing once the regular season is complete.",
          "The official playoff eligibility language can replace the placeholder featured rule above while keeping the same data structure and layout.",
        ],
        bullets: [
          "Define playoff qualification and seeding criteria.",
          "List the tiebreaker order used to separate teams in the standings.",
          "State when postseason rosters lock and who approves exceptions.",
        ],
      },
      {
        id: "conduct",
        title: "Conduct and Sportsmanship",
        paragraphs: [
          "This section should describe expected behavior for players, managers, coaches, and spectators, along with any automatic or discretionary penalties for misconduct.",
          "If ejections, suspensions, or abusive-language policies are governed by the league office, that enforcement process should be stated plainly here.",
        ],
        bullets: [
          "Prohibit abusive conduct toward umpires, opponents, and league staff.",
          "Clarify ejection and suspension consequences.",
          "Note expectations for dugout, field, and spectator-area behavior.",
        ],
      },
      {
        id: "protests-disputes",
        title: "Protests / Disputes",
        paragraphs: [
          "Use this section to outline how rule protests are filed, who reviews them, and what deadlines apply after the game ends.",
          "It can also document whether judgment calls are protestable, what evidence should be submitted, and how the league communicates final decisions.",
        ],
        bullets: [
          "State who may file a protest and the deadline to do so.",
          "List what documentation should accompany a dispute.",
          "Explain how rulings are reviewed and when a final decision is issued.",
        ],
      },
    ],
  },
  es: {
    lastUpdated: "2026-03-23",
    featuredRule: {
      title: "Recordatorio de elegibilidad para playoffs",
      paragraphs: [
        "Los jugadores deben cumplir con el requisito de participación en temporada regular antes de jugar en la postemporada. Este bloque destacado está escrito intencionalmente como marcador de posición para que el umbral oficial y el proceso de excepciones se puedan reemplazar después sin cambiar el diseño de la página.",
      ],
      bullets: [
        "Confirma el mínimo de juegos jugados o apariciones en la libreta requerido para elegibilidad.",
        "Aclara si juegos suspendidos, pospuestos o de reposición cuentan para ese mínimo.",
        "Registra por escrito cualquier excepción aprobada por el comisionado antes de cerrar el bracket.",
      ],
    },
    sections: [
      {
        id: "eligibility",
        title: "Reglas de elegibilidad de la liga",
        paragraphs: [
          "Esta sección debe explicar quién puede registrarse, qué requisitos de edad o residencia aplican y si un jugador puede participar en más de una liga o división al mismo tiempo.",
          "Si la liga usa exenciones, verificación de identidad o fechas límite de inscripción, esos puntos pueden agregarse aquí como párrafos o listas.",
        ],
        bullets: [
          "Indica los requisitos de edad y cualquier división por edad.",
          "Aclara si se requiere identificación o comprobante de residencia.",
          "Anota fechas límite de registro y el proceso para altas tardías.",
        ],
      },
      {
        id: "roster-lineup",
        title: "Reglas de roster y alineación",
        paragraphs: [
          "Usa esta sección para el tamaño del roster activo, expectativas de la tarjeta de alineación y fechas límite para agregar jugadores. También es un buen lugar para definir cómo se manejan sustitutos, corredores de cortesía o bateador designado.",
          "Si los cambios de alineación deben reportarse al umpire o al anotador antes del primer lanzamiento, ese proceso puede documentarse aquí con claridad.",
        ],
        bullets: [
          "Define el tamaño mínimo y máximo del roster.",
          "Explica cuándo un jugador debe aparecer en la alineación oficial.",
          "Describe restricciones para jugadores invitados o reglas de emergencia.",
        ],
      },
      {
        id: "schedule-game-day",
        title: "Reglas de calendario y día de juego",
        paragraphs: [
          "Esta sección puede cubrir horarios de inicio, acceso al campo, procedimientos por lluvia, responsabilidades del equipo local y visitante, y la forma de reportar marcadores finales.",
          "Si la liga tiene ventana de forfait, periodo de gracia o política de reprogramación por clima, esos detalles encajan naturalmente aquí.",
        ],
        bullets: [
          "Fija expectativas para llegada, calentamiento y preparación al inicio.",
          "Documenta quién provee pelotas, libreta y apoyo para preparar el campo.",
          "Explica el proceso para posponer, reprogramar y reportar resultados.",
        ],
      },
      {
        id: "playoffs",
        title: "Reglas de playoffs",
        paragraphs: [
          "Usa esta sección para clasificación, criterios de desempate, formato del bracket y momento en que se cierra el roster al terminar la temporada regular.",
          "El texto oficial de elegibilidad para playoffs puede reemplazar el bloque destacado de arriba sin modificar la estructura de datos ni el diseño.",
        ],
        bullets: [
          "Define cómo clasifican los equipos y cómo se acomodan en la siembra.",
          "Lista el orden de desempates utilizado en la tabla.",
          "Indica cuándo se cierra el roster de postemporada y quién aprueba excepciones.",
        ],
      },
      {
        id: "conduct",
        title: "Conducta y deportivismo",
        paragraphs: [
          "Esta sección debe describir la conducta esperada de jugadores, managers, coaches y aficionados, junto con cualquier sanción automática o discrecional por mala conducta.",
          "Si expulsiones, suspensiones o políticas de lenguaje abusivo dependen de la oficina de la liga, ese proceso de aplicación debe quedar claro aquí.",
        ],
        bullets: [
          "Prohíbe conductas abusivas contra umpires, rivales y personal de la liga.",
          "Aclara las consecuencias de expulsiones y suspensiones.",
          "Indica expectativas para dugout, terreno y área de espectadores.",
        ],
      },
      {
        id: "protests-disputes",
        title: "Protestas / disputas",
        paragraphs: [
          "Usa esta sección para explicar cómo se presenta una protesta de regla, quién la revisa y qué plazos aplican después del juego.",
          "También puede documentar si los juicios de apreciación se pueden protestar, qué evidencia debe entregarse y cómo se comunican las decisiones finales.",
        ],
        bullets: [
          "Indica quién puede presentar una protesta y en qué plazo.",
          "Lista qué documentación debe acompañar una disputa.",
          "Explica cómo se revisa el caso y cuándo se emite una decisión final.",
        ],
      },
    ],
  },
} as const satisfies Record<"en" | "es", LeagueRulesContent>;

export function getLeagueRulesContent(language: string): LeagueRulesContent {
  return language.toLowerCase().startsWith("es") ? leagueRulesContent.es : leagueRulesContent.en;
}
