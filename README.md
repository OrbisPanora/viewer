# Web

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.3.1.

## API usage

This project uses the local API version by default, so you will need to clone this repository:
https://codefirst.iut.uca.fr/gitlab/IUT_INF63/projets-etudiants/OrbisPanora/api 

Then, follow the README instructions to start the local API server.

Alternatively, if you want to use the hosted API, you can change the base URI in *web/src/app/config.ts* from:

```typescript
export const environment = {
    production: false,
    apiUrl: 'http://localhost:8000'
};
```

To:

```typescript
export const environment = {
    production: false,
    apiUrl: 'https://codefirst.iut.uca.fr/kubernetes/iut-inf63-projets-etudiants-orbispanora/orbispanora-api'
};
```

**⚠️ Warning** \
The hosted API may be slow or shut down due to administrative reasons. \
If possible, it is recommended to run the API locally.

## Development server

To start a local development server, clone this repository with:

```bash
git clone git@codefirst.iut.uca.fr:IUT_INF63/projets-etudiants/OrbisPanora/web.git
```

Then install the dependencies with:

```bash
npm install
```

And run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
