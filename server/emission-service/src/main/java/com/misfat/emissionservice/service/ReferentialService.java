package com.misfat.emissionservice.service;

import com.misfat.emissionservice.dto.CategoryWithSourcesDTO;
import com.misfat.emissionservice.dto.CategoryWithSourcesDTO.SourceOptionDTO;
import com.misfat.emissionservice.dto.CategoryWithSourcesDTO.VarianteFacteurDTO;
import com.misfat.emissionservice.dto.SourceSansFacteurDTO;
import com.misfat.emissionservice.entity.CarbonReference;
import com.misfat.emissionservice.entity.Category;
import com.misfat.emissionservice.entity.EmissionFactor;
import com.misfat.emissionservice.entity.EmissionSource;
import com.misfat.emissionservice.entity.Scope;
import com.misfat.emissionservice.repository.CarbonReferenceRepository;
import com.misfat.emissionservice.repository.CategoryRepository;
import com.misfat.emissionservice.repository.EmissionFactorRepository;
import com.misfat.emissionservice.repository.EmissionSourceRepository;
import com.misfat.emissionservice.repository.ScopeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Vues agrégées du référentiel carbone pour l'interface de saisie. */
@Service
@RequiredArgsConstructor
public class ReferentialService {

    private final CarbonReferenceRepository carbonReferenceRepository;
    private final EmissionFactorRepository emissionFactorRepository;
    private final EmissionSourceRepository emissionSourceRepository;
    private final CategoryRepository categoryRepository;
    private final ScopeRepository scopeRepository;

    /**
     * Catégories et sources associées, chaque source exposant son unité et son
     * facteur par défaut : le plus récent des facteurs rattachés à la référence.
     */
    @Transactional(readOnly = true)
    public List<CategoryWithSourcesDTO> categoriesAvecSources() {
        return categoriesAvecSources(null);
    }

    /**
     * Même vue, restreinte à ce qu'une société a le droit de lire.
     *
     * @param filialeId société consultée ; {@code null} vaut consolidation
     *                  groupe, où tout est lisible.
     */
    @Transactional(readOnly = true)
    public List<CategoryWithSourcesDTO> categoriesAvecSources(Long filialeId) {

        // Un seul chargement des facteurs, regroupés par référence : évite un
        // appel par source (N+1) sur les 68 références du référentiel.
        Map<Long, List<EmissionFactor>> facteursParReference =
                emissionFactorRepository.findVisiblesPour(filialeId).stream()
                .filter(f -> f.getCarbonReference() != null)
                .collect(Collectors.groupingBy(f -> f.getCarbonReference().getId()));

        Map<Long, List<CarbonReference>> referencesParCategorie = carbonReferenceRepository.findAll().stream()
                .filter(r -> r.getCategory() != null)
                .collect(Collectors.groupingBy(r -> r.getCategory().getId()));

        List<CategoryWithSourcesDTO> resultat = new ArrayList<>();

        for (Map.Entry<Long, List<CarbonReference>> entree : referencesParCategorie.entrySet()) {
            List<CarbonReference> references = entree.getValue();
            Category categorie = references.get(0).getCategory();

            List<SourceOptionDTO> sources = references.stream()
                    .sorted(Comparator.comparing(CarbonReference::getTypeName,
                            Comparator.nullsLast(String::compareToIgnoreCase)))
                    .map(reference -> versOption(reference, facteursParReference.get(reference.getId())))
                    .toList();

            resultat.add(new CategoryWithSourcesDTO(
                    categorie.getId(),
                    categorie.getName(),
                    categorie.getScope() != null ? categorie.getScope().getCode() : null,
                    categorie.getScope() != null ? categorie.getScope().getLabel() : null,
                    sources));
        }

        resultat.sort(Comparator
                .comparing(CategoryWithSourcesDTO::scopeCode, Comparator.nullsLast(String::compareTo))
                .thenComparing(CategoryWithSourcesDTO::categoryName, Comparator.nullsLast(String::compareToIgnoreCase)));
        return resultat;
    }

    /**
     * Sources qu'aucun facteur ne documente.
     *
     * <p>Deux manques distincts, réunis sous une seule liste parce qu'ils ont
     * la même conséquence : la source est inutilisable à la saisie.</p>
     *
     * <p>Le premier est une référence du référentiel carbone sans facteur : elle
     * paraît dans les listes déroulantes mais n'y apporte aucune valeur.</p>
     *
     * <p>Le second est plus sévère. Une source déclarée depuis l'écran
     * « Sources d'Émission » n'obtenait aucune référence carbone, et les
     * facteurs ne référencent que celles-là : elle ne pouvait donc jamais
     * recevoir de facteur, ni apparaître au référentiel, ni être choisie nulle
     * part. Elle était perdue au moment même de sa création — c'est ce que
     * signale une source rendue ici avec un {@code carbonReferenceId} nul.</p>
     */
    @Transactional(readOnly = true)
    public List<SourceSansFacteurDTO> sourcesSansFacteur() {

        Set<Long> referencesDocumentees = emissionFactorRepository.findAll().stream()
                .filter(f -> f.getCarbonReference() != null)
                .map(f -> f.getCarbonReference().getId())
                .collect(Collectors.toSet());

        List<CarbonReference> references = carbonReferenceRepository.findAll();

        List<SourceSansFacteurDTO> manques = references.stream()
                .filter(reference -> !referencesDocumentees.contains(reference.getId()))
                .map(reference -> new SourceSansFacteurDTO(
                        reference.getReferenceCode(),
                        reference.getTypeName(),
                        reference.getCategory() != null ? reference.getCategory().getName() : null,
                        reference.getCategory() != null && reference.getCategory().getScope() != null
                                ? reference.getCategory().getScope().getCode() : null,
                        reference.getDefaultUnit(),
                        reference.getId()))
                .collect(Collectors.toCollection(ArrayList::new));

        Set<String> codesDuReferentiel = references.stream()
                .map(reference -> normaliser(reference.getReferenceCode()))
                .collect(Collectors.toSet());

        emissionSourceRepository.findAll().stream()
                .filter(source -> !codesDuReferentiel.contains(normaliser(source.getReferenceCode())))
                .map(source -> new SourceSansFacteurDTO(
                        source.getReferenceCode(),
                        source.getSourceName(),
                        source.getCategory(),
                        source.getScope(),
                        source.getDefaultUnit(),
                        null))
                .forEach(manques::add);

        manques.sort(Comparator
                .comparing(SourceSansFacteurDTO::scopeCode, Comparator.nullsLast(String::compareTo))
                .thenComparing(SourceSansFacteurDTO::categoryName, Comparator.nullsLast(String::compareToIgnoreCase))
                .thenComparing(SourceSansFacteurDTO::referenceCode, Comparator.nullsLast(String::compareToIgnoreCase)));

        return manques;
    }

    /**
     * Rattache au référentiel carbone une source qui n'y figure pas encore.
     *
     * <p>Un facteur ne peut viser qu'une référence carbone : tant qu'une source
     * déclarée n'en a pas, lui affecter une valeur est impossible. La référence
     * est donc créée à la demande, à partir de ce que la source déclare — son
     * code, son libellé, sa catégorie, son unité — sans rien inventer.</p>
     *
     * <p>La catégorie est reprise si elle existe sous ce nom dans ce scope, et
     * créée sinon : une catégorie nouvelle est le cas normal quand on déclare
     * une source que le référentiel importé ne connaissait pas.</p>
     *
     * @return la référence carbone, existante ou nouvellement créée.
     */
    @Transactional
    public CarbonReference rattacherAuReferentiel(String referenceCode) {
        String code = normaliser(referenceCode);

        Optional<CarbonReference> deja = carbonReferenceRepository.findAll().stream()
                .filter(reference -> normaliser(reference.getReferenceCode()).equals(code))
                .findFirst();
        if (deja.isPresent()) return deja.get();

        EmissionSource source = emissionSourceRepository.findAll().stream()
                .filter(s -> normaliser(s.getReferenceCode()).equals(code))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Aucune source déclarée sous le code " + referenceCode));

        Scope scope = scopeRepository.findAll().stream()
                .filter(s -> s.getCode() != null && s.getCode().equalsIgnoreCase(source.getScope()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "Scope inconnu : " + source.getScope()));

        Category categorie = resoudreCategorie(source.getCategory(), scope);

        CarbonReference reference = new CarbonReference();
        reference.setReferenceCode(source.getReferenceCode());
        reference.setTypeName(source.getSourceName());
        reference.setCategory(categorie);
        reference.setDefaultUnit(source.getDefaultUnit());

        return carbonReferenceRepository.save(reference);
    }

    /**
     * Résout la catégorie d'une source, par son numéro GHG avant son nom.
     *
     * <p>La résolution se faisait par nom exact, et créait la catégorie quand
     * il ne correspondait à rien. Un écran envoyant « Investissements » là où la
     * base porte « Category 15: Investments » fabriquait donc une catégorie
     * jumelle : la source y était rattachée, son facteur y atterrissait, et
     * l'ensemble devenait invisible depuis la catégorie que l'on consultait.
     * L'enregistrement n'échouait jamais — c'est le classement qui était faux,
     * ce qui est plus trompeur, car rien ne le signale.</p>
     *
     * <p>Le numéro de catégorie est le seul repère univoque entre les deux
     * nomenclatures. Il est cherché en premier ; le nom ne sert qu'à défaut, et
     * la création reste le dernier recours — un scope 1 ou 2 n'a pas de numéro,
     * et une catégorie neuve doit rester possible.</p>
     */
    private Category resoudreCategorie(String nomDemande, Scope scope) {
        List<Category> duScope = categoryRepository.findAll().stream()
                .filter(c -> c.getScope() != null
                        && Objects.equals(c.getScope().getId(), scope.getId()))
                .collect(Collectors.toList());

        Integer numero = numeroGhg(nomDemande);

        if (numero != null) {
            Optional<Category> parNumero = duScope.stream()
                    .filter(c -> numero.equals(numeroGhg(c.getName())))
                    .findFirst();

            if (parNumero.isPresent()) {
                return parNumero.get();
            }
        }

        // Les scopes 1 et 2 n'ont pas de numéro : leurs postes se rapprochent
        // par synonymie. Sans elle, un import écrivant « Stationary combustion »
        // créerait une catégorie jumelle de « Combustion dans les
        // établissements », et les facteurs des deux cesseraient de se voir.
        String famille = familleSynonyme(nomDemande);

        if (famille != null) {
            Optional<Category> parSynonyme = duScope.stream()
                    .filter(c -> famille.equals(familleSynonyme(c.getName())))
                    .findFirst();

            if (parSynonyme.isPresent()) {
                return parSynonyme.get();
            }
        }

        return categoryRepository
                .findByNameIgnoreCaseAndScopeId(nomDemande, scope.getId())
                .orElseGet(() -> {
                    Category nouvelle = new Category();
                    nouvelle.setName(nomDemande);
                    nouvelle.setScope(scope);
                    return categoryRepository.save(nouvelle);
                });
    }

    /**
     * Groupes de libellés désignant un même poste des scopes 1 et 2.
     *
     * <p>Chaque clé nomme une famille ; les motifs reconnaissent les écritures
     * rencontrées, françaises comme anglaises. Ces postes n'ont pas de numéro
     * GHG : la synonymie est le seul repère qui les rapproche.</p>
     */
    private static final Map<String, Pattern> FAMILLES_SANS_NUMERO = Map.of(
            "combustion-fixe",
            Pattern.compile("combustion.*(etablissement|installation|fixe|stationnaire)"
                    + "|stationary.*combustion|combustion in stationary"),
            "combustion-mobile",
            Pattern.compile("combustion.*(vehicul|mobile)|mobile combustion"
                    + "|company owned (car|vehicle)"),
            "refrigerants",
            Pattern.compile("refrigerant|fugitive|frigorigene"),
            "energie-achetee",
            Pattern.compile("^energy$|electricite|electricity|purchased energy|reseau de chaleur"));

    /**
     * Famille à laquelle un libellé se rattache, ou {@code null}.
     *
     * <p>Le rapprochement se fait sans accents ni casse : « Émissions de
     * réfrigérants » et « Refrigerant gas loss » désignent le même poste.</p>
     */
    private static String familleSynonyme(String libelle) {
        if (libelle == null) {
            return null;
        }

        String cle = java.text.Normalizer.normalize(libelle.trim(), java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase();

        for (Map.Entry<String, Pattern> famille : FAMILLES_SANS_NUMERO.entrySet()) {
            if (famille.getValue().matcher(cle).find()) {
                return famille.getKey();
            }
        }

        return null;
    }

    /**
     * Numéro de catégorie GHG porté par un libellé, ou {@code null}.
     *
     * <p>Reconnaît « Category 15: Investments » comme « Categorie 15 » ou
     * « C15 ». Le code court n'est retenu que s'il occupe tout le libellé :
     * sinon « C15 » capterait n'importe quel intitulé commençant par un C suivi
     * de chiffres.</p>
     */
    private static Integer numeroGhg(String libelle) {
        if (libelle == null) {
            return null;
        }

        String cle = libelle.trim().toLowerCase();

        Matcher complet = MOTIF_CATEGORIE_GHG.matcher(cle);
        if (complet.find()) {
            return Integer.valueOf(complet.group(1));
        }

        Matcher court = MOTIF_CODE_COURT.matcher(cle);
        return court.matches() ? Integer.valueOf(court.group(1)) : null;
    }

    private static final Pattern MOTIF_CATEGORIE_GHG =
            Pattern.compile("^categor(?:y|ie)\\s*(\\d{1,2})\\b");

    private static final Pattern MOTIF_CODE_COURT =
            Pattern.compile("^c\\s*(\\d{1,2})$");

    /** Code comparable : sans espaces, en capitales. */
    private static String normaliser(String code) {
        return code == null ? "" : code.trim().toUpperCase();
    }

    /**
     * Ordre de présentation des facteurs d'une source.
     *
     * <p>Le plus récent d'abord : c'est celui que la saisie applique par défaut,
     * et celui qu'on cherche en premier dans une liste. À millésime égal, le
     * dernier créé prime — un ajout manuel se trouve alors en tête de liste
     * plutôt qu'enfoui derrière un facteur importé du même exercice.</p>
     */
    private static final Comparator<EmissionFactor> DU_PLUS_RECENT =
            Comparator.comparing(EmissionFactor::getReferenceYear,
                            Comparator.nullsFirst(Integer::compareTo))
                    .thenComparing(EmissionFactor::getId, Comparator.nullsFirst(Long::compareTo))
                    .reversed();

    private SourceOptionDTO versOption(CarbonReference reference, List<EmissionFactor> facteurs) {

        List<EmissionFactor> ordonnes = (facteurs == null ? List.<EmissionFactor>of() : facteurs)
                .stream()
                .sorted(DU_PLUS_RECENT)
                .toList();

        EmissionFactor defaut = ordonnes.isEmpty() ? null : ordonnes.get(0);

        List<VarianteFacteurDTO> variantes = ordonnes.stream()
                .map(facteur -> new VarianteFacteurDTO(
                        facteur.getId(),
                        facteur.getFactorValue(),
                        facteur.getUnit() != null ? facteur.getUnit() : reference.getDefaultUnit(),
                        facteur.getDataType(),
                        facteur.getCurrency(),
                        facteur.getDatabaseSource(),
                        facteur.getReferenceYear(),
                        facteur.getUncertaintyPercent(),
                        facteur.getValidityLabel()))
                .toList();

        return new SourceOptionDTO(
                reference.getId(),
                reference.getReferenceCode(),
                reference.getTypeName(),
                // L'unité vient du facteur retenu, à défaut de l'unité par défaut
                // de la référence : c'est elle qui est imposée à la saisie.
                defaut != null && defaut.getUnit() != null ? defaut.getUnit() : reference.getDefaultUnit(),
                defaut != null ? defaut.getId() : null,
                defaut != null ? defaut.getFactorValue() : null,
                defaut != null ? defaut.getDataType() : null,
                defaut != null ? defaut.getCurrency() : null,
                defaut != null ? defaut.getDatabaseSource() : null,
                defaut != null ? defaut.getReferenceYear() : null,
                defaut != null ? defaut.getUncertaintyPercent() : null,
                defaut != null ? defaut.getValidityLabel() : null,
                variantes);
    }
}
