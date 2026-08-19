import { defineConfig } from 'vitest/config';

/**
 * Réglages du banc de tests.
 *
 * <p>Le délai par test est porté à trente secondes. Les cinq secondes par
 * défaut suffisent à la quasi-totalité des tests, mais pas à ceux qui montent
 * un composant complet ou lisent un classeur Excel réel : ceux-là dépassent
 * dès que la machine exécute plusieurs fichiers en parallèle. Les voir échouer
 * dans une exécution complète et passer isolément n'apprend rien sur le code —
 * et un banc dont on doit relancer les échecs pour savoir s'ils comptent
 * finit par n'être plus lu.</p>
 *
 * <p>Trente secondes restent une borne : un test qui les dépasse est
 * réellement bloqué, et son échec mérite d'être regardé.</p>
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
