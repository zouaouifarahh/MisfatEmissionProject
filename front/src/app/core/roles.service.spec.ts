import { describe, it, expect } from 'vitest';

import { droitsPourRole, profilPourRole } from './roles.service';

/**
 * Droits de navigation déduits du rôle.
 *
 * <p>La règle tient en trois lignes : le lecteur consulte, le contributeur
 * collecte, l'administrateur paramètre. Ce qui compte ici, c'est qu'aucun rôle
 * mal orthographié ne se voie accorder plus que ce qu'il devrait.</p>
 */
describe('Profils d\'accès', () => {

  it('range chaque rôle métier dans sa famille', () => {
    expect(profilPourRole('ADMINISTRATEUR')).toBe('MASTER_ADMIN');
    expect(profilPourRole('MASTER_ADMIN')).toBe('MASTER_ADMIN');

    expect(profilPourRole('CONTRIBUTEUR')).toBe('CONTRIBUTEUR');
    expect(profilPourRole('RESPONSABLE_RSE')).toBe('CONTRIBUTEUR');
    expect(profilPourRole('SUPERVISEUR')).toBe('CONTRIBUTEUR');

    expect(profilPourRole('AUDITEUR')).toBe('LECTEUR');
    expect(profilPourRole('DIRECTION')).toBe('LECTEUR');
    expect(profilPourRole('MODERATEUR')).toBe('LECTEUR');
  });

  it('reconnaît les quatre intitulés du cahier des charges', () => {
    // Ces quatre-là sont ceux que l'organisation nomme. Deux manquaient à la
    // table et retombaient sur le lecteur : le validateur y arrivait par
    // chance, l'administrateur de site y perdait la saisie.
    expect(profilPourRole('Master Admin')).toBe('MASTER_ADMIN');
    expect(profilPourRole('Admin Site')).toBe('CONTRIBUTEUR');
    expect(profilPourRole('Responsable Périmètre')).toBe('CONTRIBUTEUR');
    expect(profilPourRole('Saisie')).toBe('CONTRIBUTEUR');
    expect(profilPourRole('Validateur')).toBe('LECTEUR');

    // « Admin » seul reste l'administration complète : les deux clés ne se
    // confondent pas après normalisation.
    expect(profilPourRole('Admin')).toBe('MASTER_ADMIN');
  });

  it('n\'accorde pas le paramétrage global à l\'administrateur de site', () => {
    // Les droits ne portent aucune notion de site : l'administration complète
    // lui livrerait les autres usines et l'annuaire du groupe.
    const site = droitsPourRole('ADMIN_SITE');
    expect(site.emissionCarbone).toBe(true);
    expect(site.importDonnees).toBe(true);
    expect(site.parametres).toBe(false);
    expect(site.membresEquipe).toBe(false);
    expect(site.demandesAcces).toBe(false);
  });

  it('ouvre le reporting au validateur, jamais la collecte', () => {
    const validateur = droitsPourRole('VALIDATEUR');
    expect(validateur.tableauDeBord).toBe(true);
    expect(validateur.reporting).toBe(true);
    expect(validateur.emissionCarbone).toBe(false);
    expect(validateur.importDonnees).toBe(false);
  });

  it('range le rôle par défaut du service utilisateur en lecture seule', () => {
    expect(profilPourRole('USER')).toBe('LECTEUR');
  });

  it('tolère la casse, les accents et les séparateurs', () => {
    expect(profilPourRole('modérateur')).toBe('LECTEUR');
    expect(profilPourRole('Responsable RSE')).toBe('CONTRIBUTEUR');
    expect(profilPourRole('  master-admin  ')).toBe('MASTER_ADMIN');
  });

  it('accorde le moins possible à un rôle inconnu', () => {
    expect(profilPourRole('DIRECTEUR_MARKETING')).toBe('LECTEUR');
    expect(profilPourRole('n\'importe quoi')).toBe('LECTEUR');
  });

  it('laisse la console ouverte quand aucun rôle n\'a été déposé', () => {
    // L'application n'a pas encore d'authentification interne : verrouiller une
    // console que personne ne peut déverrouiller la rendrait inutilisable.
    expect(profilPourRole(null)).toBe('MASTER_ADMIN');
    expect(profilPourRole('')).toBe('MASTER_ADMIN');
  });

  it('n\'ouvre au lecteur que le tableau de bord et le reporting', () => {
    const droits = droitsPourRole('AUDITEUR');

    expect(droits.tableauDeBord).toBe(true);
    expect(droits.reporting).toBe(true);

    expect(droits.importDonnees).toBe(false);
    expect(droits.emissionCarbone).toBe(false);
    expect(droits.parametres).toBe(false);
    expect(droits.membresEquipe).toBe(false);
    expect(droits.demandesAcces).toBe(false);
  });

  it('ouvre « Mon Profil » aux trois profils, l\'annuaire au seul administrateur', () => {
    for (const role of ['AUDITEUR', 'CONTRIBUTEUR', 'MASTER_ADMIN']) {
      expect(droitsPourRole(role).monProfil).toBe(true);
    }

    expect(droitsPourRole('AUDITEUR').membresEquipe).toBe(false);
    expect(droitsPourRole('CONTRIBUTEUR').membresEquipe).toBe(false);
    expect(droitsPourRole('MASTER_ADMIN').membresEquipe).toBe(true);
  });

  it('ouvre au contributeur la collecte, mais pas le paramétrage', () => {
    const droits = droitsPourRole('CONTRIBUTEUR');

    expect(droits.tableauDeBord).toBe(true);
    expect(droits.importDonnees).toBe(true);
    expect(droits.emissionCarbone).toBe(true);
    expect(droits.reporting).toBe(true);

    expect(droits.parametres).toBe(false);
    expect(droits.membresEquipe).toBe(false);
    expect(droits.demandesAcces).toBe(false);
  });

  it('ouvre tout à l\'administrateur', () => {
    const droits = droitsPourRole('MASTER_ADMIN');

    expect(Object.values(droits).every(valeur => valeur !== false)).toBe(true);
    expect(droits.demandesAcces).toBe(true);
    expect(droits.parametres).toBe(true);
  });
});
