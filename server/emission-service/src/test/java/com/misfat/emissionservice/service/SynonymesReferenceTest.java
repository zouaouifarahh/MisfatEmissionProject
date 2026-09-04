package com.misfat.emissionservice.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Table de synonymes du référentiel carbone.
 *
 * <p>Le classeur d'achats nomme une matière là où le référentiel nomme un
 * secteur d'activité. Sans traduction, 6 629 lignes d'achats étaient écartées
 * faute de facteur alors que le facteur existait — d'où ces cas.</p>
 */
class SynonymesReferenceTest {

    @Test
    @DisplayName("traduit un nom de matière vers le secteur d'activité correspondant")
    void traduitLaMatiereVersLeSecteur() {
        assertEquals("MS3C1LG", ReferentialService.referenceDuSynonyme("Leather"));
        assertEquals("MS3C1CR", ReferentialService.referenceDuSynonyme("Copper"));
    }

    @Test
    @DisplayName("ignore la casse : « steel » et « Steel » désignent la même référence")
    void ignoreLaCasse() {
        assertEquals("MS3C1ISM", ReferentialService.referenceDuSynonyme("steel"));
        assertEquals("MS3C1ISM", ReferentialService.referenceDuSynonyme("Steel"));
        assertEquals("MS3C1ISM", ReferentialService.referenceDuSynonyme("STEEL"));
    }

    @Test
    @DisplayName("ignore les accents : « Médicaments » se rapproche sans sa cédille")
    void ignoreLesAccents() {
        assertEquals("MS3C1DD", ReferentialService.referenceDuSynonyme("Médicaments"));
        assertEquals("MS3C1DD", ReferentialService.referenceDuSynonyme("Medicaments"));
    }

    @Test
    @DisplayName("rattrape la faute de frappe « expect » pour « except » de la source")
    void rattrapeLaFauteDeFrappeDeLaSource() {
        // Cette seule inversion de lettres écartait 519 lignes, alors que le
        // facteur MS3C1UF existait depuis l'origine.
        assertEquals("MS3C1UF", ReferentialService.referenceDuSynonyme(
                "Urethane and Other Foam Product (expect Polystyrene) Manufacturing"));
    }

    @Test
    @DisplayName("neutralise les séparateurs, quelle que soit la ponctuation du libellé")
    void neutraliseLesSeparateurs() {
        assertEquals("MS3C1ISM", ReferentialService.referenceDuSynonyme("Galvanized steel sheet"));
        assertEquals("MS3C1ISM", ReferentialService.referenceDuSynonyme("galvanized-steel-sheet"));
    }

    @Test
    @DisplayName("traduit un libellé français vers la référence anglaise")
    void traduitDepuisLeFrancais() {
        assertEquals("MS3C1CM", ReferentialService.referenceDuSynonyme("ciment"));
        assertEquals("MS3C1ISM", ReferentialService.referenceDuSynonyme("Arbre"));
    }

    @Test
    @DisplayName("rend null sur un libellé inconnu plutôt que de deviner")
    void neDevinePas() {
        // Le rejet est ce qui dit à l'exploitante quel facteur créer ; rattacher
        // au premier facteur venu produirait un calcul faux mais crédible.
        assertNull(ReferentialService.referenceDuSynonyme("Poudre de perlimpinpin"));
        assertNull(ReferentialService.referenceDuSynonyme(""));
        assertNull(ReferentialService.referenceDuSynonyme(null));
    }
}
