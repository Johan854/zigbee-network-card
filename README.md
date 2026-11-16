# Zigbee Network Card (FR)

Carte Home Assistant pour piloter son réseau **Zigbee2MQTT** sans quitter le tableau de bord :

- **Carte du réseau** : coordinateur au centre, distance de chaque appareil proportionnelle à sa qualité de liaison, relais (appareils sur secteur) sur un anneau intérieur, appareils sur pile autour, liaisons colorées selon leur qualité (LQI) : vert ≥ 100, orange 50-99, rouge < 50 ;
- **Liste des appareils** : qualité de liaison, batterie, dernier message, par où il passe ; nouveaux appareils et appareils indisponibles en tête ;
- **Ajouter un appareil** : ouvre l'appairage (avec compte à rebours) et l'arrête ;
- **Renommer** un appareil (les entités Home Assistant suivent le nouveau nom) ;
- **Supprimer** un appareil (avec confirmation) ;
- **Analyser** : relance l'analyse du réseau.

Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.

## Prérequis
- Zigbee2MQTT relié à Home Assistant par MQTT (découverte Home Assistant active, c'est le cas par défaut).
- Activer l'entité **`sensor.zigbee2mqtt_bridge_network_map`** (désactivée par défaut) : Paramètres → Appareils et services → Entités → la chercher → Activer. Puis appuyer sur « Analyser » dans la carte.
- Facultatif : activer aussi les entités `…_linkquality` des appareils pour avoir la qualité de liaison à jour entre deux analyses.

## Installation (HACS)
HACS → ⋮ → Dépôts personnalisés → l'URL de ce dépôt, catégorie **Tableau de bord**, puis Ctrl+Maj+R.

## Exemple
```yaml
type: custom:zigbee-network-card
name: Réseau Zigbee
nuance: ambre
```

## Options
| Option | Défaut | Description |
|---|---|---|
| `name` | `Réseau Zigbee` | Titre |
| `view` | `carte` | Vue au démarrage : `carte` ou `liste` |
| `map_height` | `340` | Hauteur de la carte (px) |
| `lqi_scale` | `true` | Distance « à l'échelle » : plus un appareil est loin du coordinateur (ou de son relais), plus sa liaison est faible ; cercles repères LQI 200 / 150 / 100 / 50 |
| `base_topic` | `zigbee2mqtt` | Topic de base de Zigbee2MQTT |
| `bridge_prefix` | `zigbee2mqtt_bridge` | Préfixe des entités du pont |
| `theme` | `auto` | `auto`, `light`, `dark` |

Le bloc « Nuance de couleur » est identique à celui des autres cartes.

## Fonctionnement
La carte publie sur MQTT (`mqtt.publish`) les requêtes standard de Zigbee2MQTT :
`bridge/request/networkmap`, `bridge/request/device/rename` (avec `homeassistant_rename: true`) et `bridge/request/device/remove`.
L'appairage passe par l'entité `switch.zigbee2mqtt_bridge_permit_join`.
