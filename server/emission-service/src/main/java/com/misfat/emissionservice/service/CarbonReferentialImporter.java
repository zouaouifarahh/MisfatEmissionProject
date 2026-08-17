package com.misfat.emissionservice.service;

import com.misfat.emissionservice.entity.*;
import com.misfat.emissionservice.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lecture d'un classeur de référentiel carbone et alimentation des tables
 * {@code ref_scopes}, {@code ref_categories}, {@code ref_carbon_references},
 * {@code ref_emission_sources} et {@code emission_factor}.
 *
 * <p>Partagé par le chargement au démarrage et par l'import manuel : les deux
 * doivent produire exactement le même résultat. L'opération est idempotente,
 * rejouer un fichier déjà chargé n'insère rien.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CarbonReferentialImporter {

    private static final Pattern PREFIXE_SCOPE = Pattern.compile("^MS(\\d)");
    private static final Pattern ANNEE = Pattern.compile("(19|20)\\d{2}");

    /** Doit correspondre au {@code scale} des colonnes de EmissionFactor. */
    private static final int PRECISION_FACTEUR = 10;
    private static final int PRECISION_INCERTITUDE = 2;
    private static final int MAX_ERREURS = 30;

    private static final Map<String, String> UNITES_MONETAIRES = Map.of(
            "TND", "TND", "US DOLLAR", "USD", "USD", "USD", "EUR", "EUR"
    );

    /**
     * Forme canonique des unités, indexée sur la variante en majuscules.
     *
     * <p>Le classeur écrit la même unité sous plusieurs casses — « kWh », « KWh »
     * et « Kwh » y coexistaient — et l'import les reprenait verbatim : la base
     * portait alors trois unités pour une seule grandeur, et toute comparaison
     * de chaîne s'y trompait.</p>
     *
     * <p>« KGCO2eq/KG » n'est pas un dénominateur mais le rapport complet du
     * facteur : le dénominateur attendu est le kilogramme, faute de quoi la
     * conversion d'unité devient impossible côté application.</p>
     *
     * <p>La table ne corrige que les variantes de casse constatées. Les unités
     * absentes d'ici sont conservées telles quelles : fusionner « T » et
     * « Tonne », ou « Tonne.Km » et « metric ton*km », relève d'une décision de
     * modélisation et non d'un nettoyage automatique.</p>
     */
    private static final Map<String, String> UNITES_CANONIQUES = Map.of(
            "KWH", "kWh",
            "KG", "kg",
            "KM", "km",
            "KGCO2EQ/KG", "kg"
    );

    private final ScopeRepository scopeRepository;
    private final CategoryRepository categoryRepository;
    private final CarbonReferenceRepository carbonReferenceRepository;
    private final EmissionSourceRepository emissionSourceRepository;
    private final EmissionFactorRepository emissionFactorRepository;

    /** Bilan d'un import, exposé à l'appelant. */
    public static class Bilan {
        public int totalRows;
        public int scopes;
        public int categories;
        public int sources;
        public int references;
        public int facteurs;
        /** Facteurs existants réalignés sur le fichier : valeur, source, validité. */
        public int facteursMisAJour;
        public final List<String> erreurs = new ArrayList<>();

        public int erreurCount() {
            return erreurs.size();
        }
    }

    @Transactional
    public Bilan importer(InputStream flux) {
        Bilan bilan = new Bilan();

        try (Workbook classeur = WorkbookFactory.create(flux)) {
            if (classeur.getNumberOfSheets() == 0) {
                throw new IllegalArgumentException("Le classeur ne contient aucune feuille");
            }
            Sheet feuille = classeur.getSheetAt(0);
            DataFormatter formatteur = new DataFormatter(Locale.FRANCE);

            // Les colonnes sont retrouvées par leur intitulé : chaque base
            // d'activité porte les siennes, et celles qui ne s'appliquent pas
            // sont ignorées plutôt que de décaler la lecture.
            ColonnesReferentiel colonnes = ColonnesReferentiel.depuisEntete(feuille.getRow(0), formatteur);
            if (!colonnes.exploitable()) {
                colonnes = ColonnesReferentiel.dispositionHistorique();
                log.info("En-tête non reconnu : lecture en disposition historique à neuf colonnes.");
            }

            for (int i = 1; i <= feuille.getLastRowNum(); i++) {
                Row ligne = feuille.getRow(i);
                if (ligne == null || estVide(ligne, formatteur)) {
                    continue;
                }
                bilan.totalRows++;
                try {
                    traiterLigne(ligne, colonnes, formatteur, bilan);
                } catch (Exception e) {
                    if (bilan.erreurs.size() < MAX_ERREURS) {
                        bilan.erreurs.add("ligne " + (i + 1) + " : " + e.getMessage());
                    }
                }
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("Fichier illisible : " + e.getMessage(), e);
        }

        log.info("Référentiel importé — {} lignes, {} références, {} sources, {} facteurs créés, "
                        + "{} facteurs mis à jour, {} erreurs",
                bilan.totalRows, bilan.references, bilan.sources, bilan.facteurs,
                bilan.facteursMisAJour, bilan.erreurCount());
        return bilan;
    }

    // ---------- Traitement d'une ligne ----------

    private void traiterLigne(Row ligne, ColonnesReferentiel colonnes, DataFormatter formatteur, Bilan bilan) {
        String typeName = texte(ligne, colonnes.index("type"), formatteur);
        String code = texte(ligne, colonnes.index("reference"), formatteur);
        String codeArticle = texte(ligne, colonnes.index("codeArticle"), formatteur);
        String nomCategorie = texte(ligne, colonnes.index("categorie"), formatteur);
        BigDecimal valeur = decimal(cellule(ligne, colonnes.index("valeurFact")), formatteur);
        BigDecimal incertitude = decimal(cellule(ligne, colonnes.index("incertitude")), formatteur);
        String source = texte(ligne, colonnes.index("source"), formatteur);
        String dateFact = texte(ligne, colonnes.index("dateFact"), formatteur);
        String unite = texte(ligne, colonnes.index("unite"), formatteur);

        // Le code article identifie la ligne dans les bases d'activité, où la
        // référence carbone n'est pas toujours renseignée.
        if (code == null) code = codeArticle;
        if (code == null) {
            throw new IllegalArgumentException("aucun identifiant : référence carbone et code article absents");
        }
        if (valeur == null) {
            throw new IllegalArgumentException("valeur de facteur absente");
        }
        if (nomCategorie == null) nomCategorie = "Non catégorisé";
        if (unite == null) unite = "unité";

        // Normalisation en amont de toute écriture : l'unité alimente aussi
        // CarbonReference.defaultUnit et EmissionSource.defaultUnit, qui doivent
        // porter la même forme que le facteur.
        unite = normaliserUnite(unite);

        // Alignement sur la précision des colonnes avant toute comparaison :
        // sinon la valeur parsée n'égalerait jamais celle relue en base.
        valeur = valeur.setScale(PRECISION_FACTEUR, RoundingMode.HALF_UP);
        if (incertitude != null) {
            incertitude = incertitude.setScale(PRECISION_INCERTITUDE, RoundingMode.HALF_UP);
        }

        Scope scope = obtenirScope(code, bilan);
        Category categorie = obtenirCategorie(nomCategorie, scope, bilan);
        CarbonReference reference = obtenirReference(code, typeName, categorie, unite, bilan);
        obtenirSource(code, scope, nomCategorie, typeName, unite, bilan);
        creerFacteurSiAbsent(reference, valeur, incertitude, source, dateFact, unite, bilan);
    }

    /**
     * Unité ramenée à sa forme canonique.
     *
     * <p>Les recherches de facteur existant comparent déjà sans égard à la casse
     * ({@code equalsIgnoreCase}) : normaliser ici ne crée donc aucun doublon sur
     * un référentiel déjà chargé. Une unité inconnue de la table est rendue
     * inchangée, aux espaces de bordure près.</p>
     */
    private static String normaliserUnite(String unite) {
        String propre = unite.trim();
        return UNITES_CANONIQUES.getOrDefault(propre.toUpperCase(Locale.ROOT), propre);
    }

    private Scope obtenirScope(String code, Bilan bilan) {
        Matcher m = PREFIXE_SCOPE.matcher(code.toUpperCase(Locale.ROOT));
        String numero = m.find() ? m.group(1) : "3";
        String codeScope = "SCOPE_" + numero;

        return scopeRepository.findByCode(codeScope).orElseGet(() -> {
            Scope nouveau = new Scope();
            nouveau.setCode(codeScope);
            nouveau.setLabel(libelleScope(numero));
            bilan.scopes++;
            return scopeRepository.save(nouveau);
        });
    }

    private String libelleScope(String numero) {
        return switch (numero) {
            case "1" -> "Scope 1 · Émissions directes";
            case "2" -> "Scope 2 · Énergie";
            default -> "Scope 3 · Chaîne de valeur";
        };
    }

    private Category obtenirCategorie(String nom, Scope scope, Bilan bilan) {
        return categoryRepository.findByNameIgnoreCaseAndScopeId(nom, scope.getId())
                .orElseGet(() -> {
                    Category nouvelle = new Category();
                    nouvelle.setName(nom);
                    nouvelle.setScope(scope);
                    bilan.categories++;
                    return categoryRepository.save(nouvelle);
                });
    }

    private CarbonReference obtenirReference(String code, String typeName, Category categorie,
                                             String unite, Bilan bilan) {
        return carbonReferenceRepository.findByReferenceCode(code).orElseGet(() -> {
            CarbonReference nouvelle = new CarbonReference();
            nouvelle.setReferenceCode(code);
            nouvelle.setTypeName(typeName != null ? typeName : code);
            nouvelle.setCategory(categorie);
            nouvelle.setDefaultUnit(unite);
            bilan.references++;
            return carbonReferenceRepository.save(nouvelle);
        });
    }

    private void obtenirSource(String code, Scope scope, String categorie, String typeName,
                               String unite, Bilan bilan) {
        if (emissionSourceRepository.findByReferenceCode(code).isPresent()) {
            return;
        }
        EmissionSource source = new EmissionSource();
        source.setReferenceCode(code);
        source.setScope(scope.getCode());
        source.setCategory(categorie);
        source.setSourceName(typeName != null ? typeName : code);
        source.setDefaultUnit(unite);
        emissionSourceRepository.save(source);
        bilan.sources++;
    }

    /**
     * Crée le facteur, ou aligne celui qui existe déjà sur le fichier.
     *
     * <p>Une révision de la base carbone corrige régulièrement une valeur ou
     * réattribue une source (« MISFAT_INTERNE » → « DESNZ 2024 »). Ne créer que
     * l'absent laissait ces corrections sans effet : le fichier était accepté
     * sans erreur, mais la base restait sur l'ancienne valeur.</p>
     *
     * <p>La mise à jour ne réécrit pas l'historique des mesures :
     * {@code emission_measure.total_co2e} conserve le résultat figé au moment de
     * la saisie. Seuls les calculs à venir emploient la nouvelle valeur.</p>
     */
    private void creerFacteurSiAbsent(CarbonReference reference, BigDecimal valeur, BigDecimal incertitude,
                                      String source, String dateFact, String unite, Bilan bilan) {

        List<EmissionFactor> existants = emissionFactorRepository.findByCarbonReferenceId(reference.getId());

        // Facteur identique : rien à faire, l'import reste idempotent.
        boolean identique = existants.stream()
                .anyMatch(f -> unite.equalsIgnoreCase(f.getUnit())
                        && f.getFactorValue() != null
                        && f.getFactorValue().compareTo(valeur) == 0
                        && Objects.equals(f.getDatabaseSource(), source != null ? source : "MISFAT_INTERNE"));
        if (identique) {
            return;
        }

        String devise = UNITES_MONETAIRES.get(unite.toUpperCase(Locale.ROOT));
        String sourceRetenue = source != null ? source : "MISFAT_INTERNE";

        // Même unité : c'est une révision du facteur, pas un facteur distinct.
        EmissionFactor aMettreAJour = existants.stream()
                .filter(f -> unite.equalsIgnoreCase(f.getUnit()))
                .findFirst()
                .orElse(null);

        if (aMettreAJour != null) {
            aMettreAJour.setFactorValue(valeur);
            aMettreAJour.setDatabaseSource(sourceRetenue);
            aMettreAJour.setUncertaintyPercent(incertitude);
            aMettreAJour.setValidityLabel(dateFact);
            aMettreAJour.setReferenceYear(anneeDepuis(dateFact));
            aMettreAJour.setDataType(devise != null ? "MONETAIRE" : "PHYSIQUE");
            aMettreAJour.setCurrency(devise);
            emissionFactorRepository.save(aMettreAJour);
            bilan.facteursMisAJour++;
            return;
        }

        // Unité inédite pour cette référence : second facteur, les deux coexistent.
        EmissionFactor facteur = new EmissionFactor();
        facteur.setCarbonReference(reference);
        facteur.setDataType(devise != null ? "MONETAIRE" : "PHYSIQUE");
        facteur.setDatabaseSource(sourceRetenue);
        facteur.setFactorValue(valeur);
        facteur.setUnit(unite);
        facteur.setCurrency(devise);
        facteur.setUncertaintyPercent(incertitude);
        facteur.setValidityLabel(dateFact);
        facteur.setReferenceYear(anneeDepuis(dateFact));
        emissionFactorRepository.save(facteur);
        bilan.facteurs++;
    }

    private Integer anneeDepuis(String dateFact) {
        if (dateFact != null) {
            Matcher m = ANNEE.matcher(dateFact);
            if (m.find()) return Integer.parseInt(m.group());
        }
        return LocalDate.now().getYear();
    }

    // ---------- Lecture de cellules ----------

    private boolean estVide(Row ligne, DataFormatter formatteur) {
        for (int c = 0; c < Math.max(0, ligne.getLastCellNum()); c++) {
            String v = formatteur.formatCellValue(ligne.getCell(c));
            if (v != null && !v.trim().isEmpty()) return false;
        }
        return true;
    }

    /** Cellule d'une colonne, ou null si le fichier ne porte pas cette colonne. */
    private Cell cellule(Row ligne, int colonne) {
        return colonne == ColonnesReferentiel.ABSENTE ? null : ligne.getCell(colonne);
    }

    private String texte(Row ligne, int colonne, DataFormatter formatteur) {
        if (colonne == ColonnesReferentiel.ABSENTE) return null;
        String valeur = formatteur.formatCellValue(ligne.getCell(colonne));
        if (valeur == null) return null;
        valeur = valeur.replace(' ', ' ').replace(' ', ' ').trim();
        return valeur.isEmpty() ? null : valeur;
    }

    /** Tolère la notation française : espace fine, virgule décimale, préfixe ±. */
    private BigDecimal decimal(Cell cellule, DataFormatter formatteur) {
        if (cellule == null) return null;
        if (cellule.getCellType() == CellType.NUMERIC) {
            return BigDecimal.valueOf(cellule.getNumericCellValue());
        }
        String brut = formatteur.formatCellValue(cellule);
        if (brut == null || brut.isBlank()) return null;

        String nettoye = brut.replaceAll("[\\s\\u00A0\\u202F]", "")
                .replace("±", "")
                .replaceAll("[^0-9,.\\-]", "");
        if (nettoye.contains(",") && nettoye.contains(".")) {
            nettoye = nettoye.lastIndexOf(',') > nettoye.lastIndexOf('.')
                    ? nettoye.replace(".", "").replace(',', '.')
                    : nettoye.replace(",", "");
        } else {
            nettoye = nettoye.replace(',', '.');
        }
        try {
            return nettoye.isBlank() ? null : new BigDecimal(nettoye);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
