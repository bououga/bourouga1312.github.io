# bourouga1312.github.io

## Site de Kalil d’Orléans

Le dossier `site/` est une copie complète de https://kalildorleans.neocities.org/ : pages, fichiers pour les agents IA, images.

Toute modification de `site/` envoyée sur la branche `main` est publiée automatiquement sur Neocities par `.github/workflows/neocities.yml`.

### Activer la publication automatique (une seule fois)

1. Sur Neocities, connecté : https://neocities.org/settings/kalildorleans#api_key → **Generate API Key**, puis copie la clé.
2. Sur GitHub : https://github.com/bououga/bourouga1312.github.io/settings/secrets/actions/new
   - **Name** : `NEOCITIES_API_KEY`
   - **Secret** : colle la clé
   - **Add secret**

La clé reste privée : elle n’apparaît ni dans le code ni dans l’historique.

## Profils publics

Voir [PROFILS.md](PROFILS.md).
