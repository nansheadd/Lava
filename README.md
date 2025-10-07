# Lava Web Client

This project is a Vite + React front-end for the Lava tools platform. The repository contains everything required to build a static bundle that is served through Nginx in production.

## Local development

```bash
npm install
npm run dev
```

The dev server defaults to `http://localhost:5173`.

## Building locally

To create a production bundle, run:

```bash
npm run build
```

The output is written to the `dist/` directory.

## Deploying to Fly.io

The app ships with a `fly.toml` configuration and a Dockerfile that builds the static bundle and serves it with Nginx. Fly.io can build the image directly from this repository—you do **not** need to reference a pre-built image.

1. Log in to Fly:

   ```bash
   fly auth login
   ```

2. Deploy using the existing configuration:

   ```bash
   fly deploy --config fly.toml
   ```

   This command asks Fly's builder to create the image from `Dockerfile` and deploy it. Passing `--image <tag>` will only work if that tag already exists in the Fly registry; otherwise Fly returns `Could not find image ...`. Running `fly deploy` without `--image` avoids that failure.

3. If you need to override the API URL exposed to the front-end, edit the `VITE_API_URL` entry under `[build.args]` in `fly.toml` before deploying.

## Environment variables

The build expects a `VITE_API_URL` value so the front-end can reach the backend API. The Fly configuration sets this argument automatically for production deploys.

## License

MIT
