package com.misfat.emissionservice.service;

import com.misfat.emissionservice.dto.EmissionStatsDTO;
import com.misfat.emissionservice.dto.MesureAgregatRow;
import com.misfat.emissionservice.repository.EmissionMeasureRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/**
 * Calcul des agrégats du tableau de bord directeur.
 *
 * <p>Tout part d'un unique {@code GROUP BY} exécuté par MSSQL
 * ({@link EmissionMeasureRepository#agregerParAxes()}) : aucune valeur n'est
 * codée en dur, et le périmètre demandé se découpe dans le résultat groupé.</p>
 *
 * <p>Deux modes de valorisation cohabitent. Le mode <em>physique</em> somme les
 * tCO₂e de toutes les mesures. Le mode <em>monétaire</em> ne retient que les
 * mesures adossées à un facteur monétaire et somme les montants d'origine,
 * ramenés à une devise unique pour rester additionnables.</p>
 */
@Service
@RequiredArgsConstructor
public class EmissionStatsService {

    /** Les facteurs sont exprimés en kg CO₂e ; le tableau de bord affiche des tonnes. */
    private static final BigDecimal KG_VERS_TONNE = BigDecimal.valueOf(1000);

    private static final String MODE_MONETAIRE = "MONETAIRE";
    private static final String MODE_PHYSIQUE = "PHYSIQUE";

    private static final String SCOPE_NON_CLASSE = "NON_CLASSE";
    private static final String CATEGORIE_NON_CLASSEE = "Non catégorisé";

    private final EmissionMeasureRepository measureRepository;
    private final CurrencyConverter currencyConverter;

    /**
     * @param mode     {@code PHYSIQUE} (tCO₂e) ou {@code MONETAIRE} (devise)
     * @param entityId filiale ; {@code null} vaut consolidation groupe
     * @param year     exercice ; {@code null} vaut toutes années confondues
     * @param devise   devise de restitution en mode monétaire, TND par défaut
     */
    @Transactional(readOnly = true)
    public EmissionStatsDTO agreger(String mode, Long entityId, Integer year, String devise) {
        boolean monetaire = MODE_MONETAIRE.equalsIgnoreCase(mode);
        String deviseCible = (devise == null || devise.isBlank())
                ? CurrencyConverter.DEVISE_PIVOT
                : devise.trim().toUpperCase(Locale.ROOT);

        List<MesureAgregatRow> lignes = measureRepository.agregerParAxes().stream()
                .filter(l -> entityId == null || entityId.equals(l.getFilialeId()))
                .filter(l -> year == null || year.equals(l.getAnnee()))
                .filter(l -> !monetaire || MODE_MONETAIRE.equalsIgnoreCase(l.getTypeDonnee()))
                .toList();

        Map<String, BigDecimal> parScope = new TreeMap<>();
        Map<String, BigDecimal> parCategorie = new TreeMap<>();
        Map<String, Map<String, BigDecimal>> parScopePuisCategorie = new TreeMap<>();
        Map<String, BigDecimal> parDevise = new TreeMap<>();
        Map<Long, BigDecimal> parFiliale = new LinkedHashMap<>();
        Map<Long, Long> mesuresParFiliale = new LinkedHashMap<>();
        Set<String> nonConverties = new TreeSet<>();

        BigDecimal total = BigDecimal.ZERO;
        long nombreMesures = 0;

        for (MesureAgregatRow ligne : lignes) {
            BigDecimal valeur = monetaire
                    ? montantConverti(ligne, deviseCible, nonConverties)
                    : tonnes(ligne.getSommeCo2e());

            String scope = Optional.ofNullable(ligne.getScopeCode()).orElse(SCOPE_NON_CLASSE);
            String categorie = Optional.ofNullable(ligne.getCategorieNom()).orElse(CATEGORIE_NON_CLASSEE);
            long nombre = Optional.ofNullable(ligne.getNombre()).orElse(0L);

            parScope.merge(scope, valeur, BigDecimal::add);
            parCategorie.merge(categorie, valeur, BigDecimal::add);
            parScopePuisCategorie
                    .computeIfAbsent(scope, k -> new TreeMap<>())
                    .merge(categorie, valeur, BigDecimal::add);
            parFiliale.merge(ligne.getFilialeId(), valeur, BigDecimal::add);
            mesuresParFiliale.merge(ligne.getFilialeId(), nombre, Long::sum);

            if (monetaire) {
                parDevise.merge(deviseOrigine(ligne), montantBrut(ligne), BigDecimal::add);
            }

            total = total.add(valeur);
            nombreMesures += nombre;
        }

        return new EmissionStatsDTO(
                monetaire ? MODE_MONETAIRE : MODE_PHYSIQUE,
                monetaire ? deviseCible : "tCO2e",
                monetaire ? deviseCible : null,
                nombreMesures,
                arrondi(total, monetaire),
                arrondi(parScope.getOrDefault("SCOPE_1", BigDecimal.ZERO), monetaire),
                arrondi(parScope.getOrDefault("SCOPE_2", BigDecimal.ZERO), monetaire),
                arrondi(parScope.getOrDefault("SCOPE_3", BigDecimal.ZERO), monetaire),
                arrondirCarte(parScope, monetaire),
                arrondirCarte(parCategorie, monetaire),
                arrondirCarteImbriquee(parScopePuisCategorie, monetaire),
                partsFiliales(parFiliale, mesuresParFiliale, total, monetaire),
                arrondirCarte(parDevise, true),
                List.copyOf(nonConverties));
    }

    /**
     * Montant d'une ligne ramené à la devise de restitution.
     *
     * <p>Une devise sans taux connu n'est pas approximée : le montant est repris
     * tel quel et la devise est signalée à l'appelant, qui peut alors afficher
     * une réserve plutôt qu'un total faussement homogène.</p>
     */
    private BigDecimal montantConverti(MesureAgregatRow ligne, String deviseCible, Set<String> nonConverties) {
        BigDecimal montant = montantBrut(ligne);
        String origine = deviseOrigine(ligne);

        if (origine.equals(deviseCible)) {
            return montant;
        }
        if (!currencyConverter.estConnue(origine) || !currencyConverter.estConnue(deviseCible)) {
            nonConverties.add(origine);
            return montant;
        }
        return currencyConverter.convertir(montant, origine, deviseCible);
    }

    private BigDecimal montantBrut(MesureAgregatRow ligne) {
        return Optional.ofNullable(ligne.getSommeQuantite()).orElse(BigDecimal.ZERO);
    }

    /** Une mesure sans devise explicite est réputée libellée dans le pivot. */
    private String deviseOrigine(MesureAgregatRow ligne) {
        String devise = ligne.getDevise();
        return (devise == null || devise.isBlank())
                ? CurrencyConverter.DEVISE_PIVOT
                : devise.trim().toUpperCase(Locale.ROOT);
    }

    private BigDecimal tonnes(BigDecimal kilos) {
        return Optional.ofNullable(kilos).orElse(BigDecimal.ZERO)
                .divide(KG_VERS_TONNE, 6, RoundingMode.HALF_UP);
    }

    /**
     * Quote-part de chaque filiale, triée par contribution décroissante pour que
     * le donut se lise sans retraitement côté client.
     */
    private List<EmissionStatsDTO.FilialeShare> partsFiliales(Map<Long, BigDecimal> parFiliale,
                                                              Map<Long, Long> mesuresParFiliale,
                                                              BigDecimal total,
                                                              boolean monetaire) {
        boolean totalUtilisable = total.compareTo(BigDecimal.ZERO) != 0;

        return parFiliale.entrySet().stream()
                .map(e -> new EmissionStatsDTO.FilialeShare(
                        e.getKey(),
                        arrondi(e.getValue(), monetaire),
                        totalUtilisable
                                ? e.getValue().multiply(BigDecimal.valueOf(100))
                                    .divide(total, 2, RoundingMode.HALF_UP)
                                : BigDecimal.ZERO,
                        mesuresParFiliale.getOrDefault(e.getKey(), 0L)))
                .sorted(Comparator.comparing(EmissionStatsDTO.FilialeShare::value).reversed())
                .toList();
    }

    private BigDecimal arrondi(BigDecimal valeur, boolean monetaire) {
        return valeur.setScale(monetaire ? 2 : 3, RoundingMode.HALF_UP);
    }

    private Map<String, BigDecimal> arrondirCarte(Map<String, BigDecimal> carte, boolean monetaire) {
        Map<String, BigDecimal> resultat = new LinkedHashMap<>();
        carte.forEach((cle, valeur) -> resultat.put(cle, arrondi(valeur, monetaire)));
        return resultat;
    }

    private Map<String, Map<String, BigDecimal>> arrondirCarteImbriquee(
            Map<String, Map<String, BigDecimal>> carte, boolean monetaire) {
        Map<String, Map<String, BigDecimal>> resultat = new LinkedHashMap<>();
        carte.forEach((cle, sousCarte) -> resultat.put(cle, arrondirCarte(sousCarte, monetaire)));
        return resultat;
    }
}
