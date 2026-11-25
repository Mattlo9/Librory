# Librory

**Librory** es una biblioteca personal de escritorio *local-first* para organizar, leer y estudiar libros, papers, artículos y material de estudio. Construida con **Tauri v2**, **React**, **TypeScript** y **SQLite**.

> Tus archivos, notas y estadísticas viven en tu propio equipo, sin cuentas obligatorias ni dependencia de la nube.

<!-- Agrega aquí una captura de pantalla o GIF de la aplicación:
![Vista principal de Librory](docs/screenshot.png)
-->

---

## Características principales

- **Gestión de biblioteca**: Importa archivos **PDF** y **EPUB** arrastrando y soltando o desde el explorador, con extracción automática de portadas (y portadas tipográficas cuando no hay imagen).
- **Lector integrado**: Lee tus PDFs y EPUBs directamente dentro de la aplicación.
- **Organización flexible**: Clasifica tu material con **estanterías jerárquicas**, **etiquetas**, **favoritos**, vista en cuadrícula o lista, acciones en lote y paleta de comandos rápida.
- **Subrayados y notas**: Guarda *highlights* y redacta notas con vista previa en Markdown vinculadas a tus lecturas.
- **Enfoque y estadísticas**: Incluye temporizador **Pomodoro**, registro de sesiones de estudio, mapa de calor de actividad y métricas de lectura.
- **Privado y local-first**: Base de datos local en **SQLite** y archivos almacenados en el directorio de datos de la aplicación.
- **Temas**: Interfaz adaptable con soporte de temas claro y oscuro.

---

## Descarga e instalación

Puedes descargar el instalador más reciente desde la sección de **[Releases](https://github.com/Mattlo9/Librory/releases)**.

### Aviso de seguridad del sistema operativo
Mientras la aplicación no cuente con certificados comerciales de firma digital, tu sistema operativo puede mostrar una advertencia al instalarla por primera vez:

- **Windows (SmartScreen)**: Haz clic en **Más información** → **Ejecutar de todas formas**.
- **macOS (Gatekeeper)**: Si indica que el desarrollador no está verificado, abre la app con clic derecho → **Abrir**, o elimina el atributo de cuarentena desde la terminal si corresponde.

---

## Compilar desde el código fuente

### Requisitos previos
- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install) (toolchain estable)
- [Dependencias del sistema de Tauri v2](https://v2.tauri.app/start/prerequisites/) (en Windows: WebView2 y Visual Studio C++ Build Tools)

### Pasos

1. Clona el repositorio:
   ```bash
   git clone https://github.com/Mattlo9/Librory.git
   cd Librory
   ```

2. Instala las dependencias:
   ```bash
   bun install
   ```

3. Ejecuta la aplicación en modo desarrollo:
   ```bash
   bun run tauri dev
   ```

4. Genera los instaladores de producción:
   ```bash
   bun run tauri build
   ```
   Los instaladores generados aparecerán en `src-tauri/target/release/bundle/`.

### Otros comandos útiles
```bash
bun run typecheck   # Verificación de tipos con TypeScript
bun test            # Ejecutar pruebas unitarias
```

---

## Stack tecnológico

- **Desktop & Backend**: [Tauri v2](https://v2.tauri.app/), Rust, SQLite (`tauri-plugin-sql`)
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI
- **Estado y datos**: Zustand, TanStack Query
- **Lectura de documentos**: `@embedpdf/viewer-react`, `pdfjs-dist`, `fflate`

---

## Estructura del proyecto

```text
Librory/
├── src/
│   ├── components/    # Componentes de interfaz reutilizables
│   ├── features/      # Módulos (library, reader, highlights, notes, shelves, pomodoro, stats)
│   ├── services/      # Repositorios SQLite, importación y procesamiento PDF/EPUB
│   └── store/         # Estado global (UI y Pomodoro)
└── src-tauri/
    ├── migrations/    # Migraciones de SQLite
    └── src/           # Comandos Rust, almacenamiento, importación/exportación y validación
```

---

## Licencia

Este proyecto se distribuye bajo la licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.
