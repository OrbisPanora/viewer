/**
 * Routes of the app. The viewer is loaded on demand so that pixi.js, the largest
 * dependency, is not downloaded by someone who only reads the About page.
 */
import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';

/**
 * Creates the router.
 *
 * @param history - History implementation; tests pass an in-memory one.
 * @returns The router.
 */
export function createAppRouter(history = createWebHistory(import.meta.env.BASE_URL)) {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: HomeView },
      { path: '/viewer', name: 'viewer', component: () => import('@/views/ViewerView.vue') },
      { path: '/api-docs', name: 'api-docs', component: () => import('@/views/ApiDocsView.vue') },
      { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue') },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  });
}
