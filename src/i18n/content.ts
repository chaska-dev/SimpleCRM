export type Lang = "es" | "en";

export const REPO_URL = "https://github.com/chaska-dev/SimpleCRM";

export const INSTALL_COMMANDS = [
  "git clone https://github.com/chaska-dev/SimpleCRM.git",
  "cd SimpleCRM",
  "python scripts/generate-secrets.py",
  "docker compose --env-file .env.docker up -d --build",
].join("\n");

export const INSTALL_LIST = INSTALL_COMMANDS.split("\n");

/** Phone screenshot size in pixels. */
export const MOBILE_SIZE: [number, number] = [1170, 2532];

export const APP_URL = "http://127.0.0.1:8080";

const MCP_URL = "http://127.0.0.1:8080/mcp/";

export const MCP_SNIPPETS = [
  {
    key: "claude-code",
    label: "Claude Code",
    code: `claude mcp add --transport http simple-crm ${MCP_URL} --header "Authorization: Bearer <TOKEN>"`,
  },
  {
    key: "claude-desktop",
    label: "Claude Desktop",
    code: `{
  "mcpServers": {
    "simple-crm": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${MCP_URL}", "--header", "Authorization:Bearer <TOKEN>"]
    }
  }
}`,
  },
  {
    key: "cursor",
    label: "Cursor",
    code: `{
  "mcpServers": {
    "simple-crm": {
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}`,
  },
  {
    key: "vscode",
    label: "VS Code",
    code: `{
  "servers": {
    "simple-crm": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}`,
  },
] as const;

export const SHOT_KEYS = ["home", "people", "board", "integrations", "home-light"] as const;
export type ShotKey = (typeof SHOT_KEYS)[number];

/** Real height of each screenshot (the width is always 2880). */
export const SHOT_SIZE: Record<ShotKey, [number, number]> = {
  home: [2880, 1800],
  people: [2880, 1800],
  board: [2880, 1440],
  integrations: [2880, 1800],
  "home-light": [2880, 1800],
};

interface Copy {
  htmlLang: string;
  title: string;
  description: string;
  nav: { install: string; features: string; mcp: string; label: string; menu: string; close: string };
  github: string;
  switchLabel: string;
  hero: { h1: string; sub: string; cta: string; install: string; note: string };
  install: {
    h2: string;
    intro: string;
    copy: string;
    copied: string;
    copyLine: string;
    after: string;
    registerNote: string;
    backupNote: string;
    stepsTitle: string;
    steps: { title: string; text: string }[];
  };
  preview: {
    h2: string;
    intro: string;
    hint: string;
    tabs: Record<ShotKey, { label: string; alt: string; caption: string }>;
  };
  features: { h2: string; items: { title: string; text: string }[] };
  mcp: {
    h2: string;
    intro: string;
    steps: { title: string; text: string }[];
    snippetsTitle: string;
    snippetsNote: string;
    copy: string;
    copied: string;
    lanNote: string;
  };
  transfer: {
    h2: string;
    intro: string;
    importTitle: string;
    importText: string;
    exportTitle: string;
    exportText: string;
  };
  footer: { license: string; repo: string; tagline: string; madeBefore: string; madeAfter: string; heart: string; top: string };
}

export const COPY: Record<Lang, Copy> = {
  es: {
    htmlLang: "es",
    title: "Simple CRM: un CRM personal autoalojado",
    description:
      "Simple CRM es un CRM personal autoalojado para cuidar tus relaciones: personas, fechas importantes y recordatorios, con notas y adjuntos cifrados.",
    nav: { install: "Instalar", features: "Funciones", mcp: "Agentes de IA", label: "Principal", menu: "Menú", close: "Cerrar menú" },
    github: "Ver en GitHub",
    switchLabel: "Idioma",
    hero: {
      h1: "Un CRM personal para cuidar tus relaciones",
      sub: "Autoalojado. Personas, fechas importantes y recordatorios, con notas y adjuntos cifrados.",
      cta: "Ver en GitHub",
      install: "Instalar",
      note: "Docker Compose. Tus datos se quedan en tu servidor.",
    },
    install: {
      h2: "Instalación",
      intro: "Necesitas Docker con Compose v2 y Python 3 (solo para generar los secretos).",
      copy: "Copiar",
      copied: "Copiado",
      copyLine: "Copiar comando",
      after: "Luego abre",
      registerNote: "y crea la primera cuenta en",
      backupNote:
        "Guarda una copia de FIELD_ENCRYPTION_KEYS fuera del servidor: si la pierdes, las notas y los adjuntos cifrados no se pueden recuperar. En Linux o macOS el script puede llamarse python3.",
      stepsTitle: "Levantamiento rápido",
      steps: [
        {
          title: "Clona y genera los secretos",
          text: "El script crea .env.docker con la clave de Django, la clave de cifrado y la contraseña de Postgres.",
        },
        {
          title: "Levanta el stack",
          text: "Docker Compose construye y arranca la base de datos, el backend, el frontend y el proxy.",
        },
        {
          title: "Abre la app",
          text: "Entra a 127.0.0.1:8080 y crea tu cuenta en /register/. El registro se cierra después del primer usuario.",
        },
      ],
    },
    preview: {
      h2: "La app, tal como es",
      intro: "Capturas reales de la aplicación con datos de demostración.",
      hint: "Elige un fotograma o usa las teclas 1 a 5.",
      tabs: {
        home: {
          label: "Inicio",
          alt: "Pantalla de inicio de Simple CRM en tema oscuro: calendario del mes, recordatorios pendientes, personas favoritas, próximas fechas y sugerencias para contactar.",
          caption: "Calendario, pendientes, próximas fechas y a quién te toca escribir.",
        },
        people: {
          label: "Personas",
          alt: "Listado de personas de Simple CRM en tema oscuro, con tarjetas que muestran tags, estado de contacto y filtros por cadencia.",
          caption: "Tarjetas con tags, filtros por cadencia y estado de contacto.",
        },
        board: {
          label: "Tablero",
          alt: "Tablero de recordatorios de Simple CRM en tema oscuro, con las columnas Pendiente, En curso y Hecho.",
          caption: "Recordatorios en columnas: pendiente, en curso y hecho.",
        },
        integrations: {
          label: "Agentes de IA",
          alt: "Ajustes, pestaña Integraciones, de Simple CRM: interruptor de acceso MCP, URL del servidor, token y fragmentos para configurar el cliente.",
          caption: "Ajustes > Integraciones: URL, token y el bloque listo para tu cliente.",
        },
        "home-light": {
          label: "Tema claro",
          alt: "Pantalla de inicio de Simple CRM en tema claro, con el mismo calendario, pendientes, favoritos y próximas fechas.",
          caption: "Tema claro u oscuro, con el color de acento que elijas.",
        },
      },
    },
    features: {
      h2: "Qué incluye",
      items: [
        {
          title: "Personas y contactos",
          text: "Una ficha por persona con varios canales, tags, favoritos, cadencia de contacto y un registro de interacciones.",
        },
        {
          title: "Cumpleaños y fechas",
          text: "Fechas anuales con la edad calculada y una vista de las próximas.",
        },
        {
          title: "Recordatorios y tablero",
          text: "Estados (pendiente, en curso, hecho), recurrencia y una vista de tablero además de la lista.",
        },
        {
          title: "Instituciones",
          text: "Universidades, empresas y otras organizaciones, con logo y membresías de cada persona.",
        },
        {
          title: "Notas y adjuntos cifrados",
          text: "Cifrado Fernet en reposo. La clave vive en tu .env.docker, no en la base de datos.",
        },
        {
          title: "Importar y exportar",
          text: "vCard (.vcf) y CSV de Google Contacts, con detección de duplicados.",
        },
        {
          title: "Agentes de IA por MCP",
          text: "Claude Code, Claude Desktop, Cursor o VS Code leen y crean datos con un token revocable.",
        },
        {
          title: "Español e inglés, temas y acento",
          text: "Interfaz en español e inglés, tema claro y oscuro, y el color de acento que prefieras.",
        },
      ],
    },
    mcp: {
      h2: "Conecta un agente de IA",
      intro:
        "El servidor MCP es opcional y viene apagado. Lo activas desde la app y revocas el acceso cuando quieras.",
      steps: [
        {
          title: "Actívalo",
          text: "En Ajustes > Integraciones, enciende “Permitir acceso de agentes de IA (MCP)”.",
        },
        {
          title: "Copia URL y token",
          text: "En Conexión copia la URL del servidor y el token. Si no hay token, pulsa “Generar token”; “Probar conexión” lo verifica.",
        },
        {
          title: "Pega el bloque",
          text: "En Configura tu cliente elige Claude Code, Claude Desktop, Cursor o VS Code y pega el bloque, que ya lleva tu URL y tu token.",
        },
      ],
      snippetsTitle: "Así se ve el bloque de cada cliente",
      snippetsNote:
        "En la app ya vienen con tu URL y tu token reales; aquí <TOKEN> es un marcador. Claude Desktop necesita Node.js.",
      copy: "Copiar",
      copied: "Copiado",
      lanNote:
        "Una URL localhost solo funciona en el mismo equipo. Para conectar desde otro dispositivo, abre la app con la IP de tu red y publica el puerto (guía de configuración en el repositorio).",
    },
    transfer: {
      h2: "Importar y exportar contactos",
      intro: "En Ajustes > Importar y exportar. Nada se escribe hasta que revisas la vista previa.",
      importTitle: "Importar",
      importText:
        "Sube un .vcf exportado desde Android, iPhone (iCloud) o Google Contactos, o un CSV de Google Contactos. Verás los duplicados y eliges si omitirlos, completarlos o crearlos igual.",
      exportTitle: "Exportar",
      exportText:
        "Exporta a vCard o a CSV de Google, todos los contactos o los de un tag. Las notas solo se incluyen si lo pides, y entonces salen sin cifrar.",
    },
    footer: {
      license: "Licencia MIT",
      repo: "Repositorio en GitHub",
      tagline: "Un CRM personal autoalojado.",
      madeBefore: "Hecho con",
      madeAfter: "por",
      heart: "cariño",
      top: "Volver arriba",
    },
  },
  en: {
    htmlLang: "en",
    title: "Simple CRM: a self-hosted personal CRM",
    description:
      "Simple CRM is a self-hosted personal CRM to look after your relationships: people, important dates and reminders, with encrypted notes and attachments.",
    nav: { install: "Install", features: "Features", mcp: "AI agents", label: "Main", menu: "Menu", close: "Close menu" },
    github: "View on GitHub",
    switchLabel: "Language",
    hero: {
      h1: "A personal CRM to look after your relationships",
      sub: "Self-hosted. People, important dates and reminders, with encrypted notes and attachments.",
      cta: "View on GitHub",
      install: "Install",
      note: "Docker Compose. Your data stays on your server.",
    },
    install: {
      h2: "Install",
      intro: "You need Docker with Compose v2 and Python 3 (only to generate the secrets).",
      copy: "Copy",
      copied: "Copied",
      copyLine: "Copy command",
      after: "Then open",
      registerNote: "and create the first account at",
      backupNote:
        "Back up FIELD_ENCRYPTION_KEYS outside the server: if you lose it, encrypted notes and attachments cannot be recovered. On Linux or macOS the script may be python3.",
      stepsTitle: "Quick start",
      steps: [
        {
          title: "Clone and generate secrets",
          text: "The script creates .env.docker with the Django secret, the encryption key and the Postgres password.",
        },
        {
          title: "Start the stack",
          text: "Docker Compose builds and starts the database, the backend, the frontend and the proxy.",
        },
        {
          title: "Open the app",
          text: "Go to 127.0.0.1:8080 and create your account at /register/. Registration closes after the first user.",
        },
      ],
    },
    preview: {
      h2: "The app, as it is",
      intro: "Real screenshots of the application with demo data.",
      hint: "Pick a frame or use keys 1 to 5.",
      tabs: {
        home: {
          label: "Home",
          alt: "Simple CRM home screen in the dark theme: monthly calendar, pending reminders, favorite people, upcoming dates and suggestions to reach out.",
          caption: "Calendar, pending items, upcoming dates and who to write to next.",
        },
        people: {
          label: "People",
          alt: "Simple CRM people list in the dark theme, with cards showing tags, contact status and cadence filters.",
          caption: "Cards with tags, cadence filters and contact status.",
        },
        board: {
          label: "Board",
          alt: "Simple CRM reminders board in the dark theme, with To do, In progress and Done columns.",
          caption: "Reminders in columns: to do, in progress and done.",
        },
        integrations: {
          label: "AI integrations",
          alt: "Simple CRM Settings, Integrations tab: MCP access switch, server URL, token and snippets to set up a client.",
          caption: "Settings > Integrations: URL, token and the block ready for your client.",
        },
        "home-light": {
          label: "Light theme",
          alt: "Simple CRM home screen in the light theme, with the same calendar, pending items, favorites and upcoming dates.",
          caption: "Light or dark theme, with the accent color you choose.",
        },
      },
    },
    features: {
      h2: "What is included",
      items: [
        {
          title: "People and contacts",
          text: "One record per person with several channels, tags, favorites, contact cadence and an interaction log.",
        },
        {
          title: "Birthdays and dates",
          text: "Yearly dates with calculated age and a view of the upcoming ones.",
        },
        {
          title: "Reminders and board",
          text: "Statuses (to do, in progress, done), recurrence and a board view next to the list.",
        },
        {
          title: "Organizations",
          text: "Universities, companies and other organizations, with logos and each person's memberships.",
        },
        {
          title: "Encrypted notes and attachments",
          text: "Fernet encryption at rest. The key lives in your .env.docker, not in the database.",
        },
        {
          title: "Import and export",
          text: "vCard (.vcf) and Google Contacts CSV, with duplicate detection.",
        },
        {
          title: "AI agents via MCP",
          text: "Claude Code, Claude Desktop, Cursor or VS Code read and create data with a revocable token.",
        },
        {
          title: "English and Spanish, themes and accent",
          text: "English and Spanish interface, light and dark themes, and the accent color you prefer.",
        },
      ],
    },
    mcp: {
      h2: "Connect an AI agent",
      intro: "The MCP server is optional and off by default. You turn it on in the app and can revoke access at any time.",
      steps: [
        {
          title: "Turn it on",
          text: "In Settings > Integrations, switch on “Allow AI agent access (MCP)”.",
        },
        {
          title: "Copy URL and token",
          text: "Under Connection, copy the server URL and the token. If there is none, press “Generate token”; “Test connection” checks it.",
        },
        {
          title: "Paste the block",
          text: "Under Set up your client, pick Claude Code, Claude Desktop, Cursor or VS Code and paste the block, already filled with your URL and token.",
        },
      ],
      snippetsTitle: "What each client block looks like",
      snippetsNote:
        "In the app they come with your real URL and token; here <TOKEN> is a placeholder. Claude Desktop needs Node.js.",
      copy: "Copy",
      copied: "Copied",
      lanNote:
        "A localhost URL only works on the same computer. To connect from another device, open the app through your network IP and publish the port (see the configuration guide in the repository).",
    },
    transfer: {
      h2: "Import and export contacts",
      intro: "In Settings > Import and export. Nothing is written until you review the preview.",
      importTitle: "Import",
      importText:
        "Upload a .vcf exported from Android, iPhone (iCloud) or Google Contacts, or a Google Contacts CSV. You see the duplicates and choose to skip, complete or create them anyway.",
      exportTitle: "Export",
      exportText:
        "Export to vCard or Google CSV, all contacts or one tag. Notes are only included if you ask for them, and then they leave unencrypted.",
    },
    footer: {
      license: "MIT License",
      repo: "Repository on GitHub",
      tagline: "A self-hosted personal CRM.",
      madeBefore: "Made with",
      madeAfter: "by",
      heart: "love",
      top: "Back to top",
    },
  },
};
