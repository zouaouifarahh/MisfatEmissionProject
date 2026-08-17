package com.misfat.organizationservice.service;

import com.misfat.organizationservice.dto.CurrencyDTO;
import com.misfat.organizationservice.dto.WeeklyRateDTO;
import com.misfat.organizationservice.entity.CurrencyExchangeRate;
import com.misfat.organizationservice.repository.CurrencyExchangeRateRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.WeekFields;
import java.util.*;

@Service
public class CurrencyService {

    /** Libellés usuels ; toute devise absente reste exposée avec son seul code. */
    private static final Map<String, String> LIBELLES = Map.of(
            "TND", "Dinar tunisien",
            "EUR", "Euro",
            "USD", "Dollar américain",
            "MAD", "Dirham marocain",
            "GBP", "Livre sterling",
            "CHF", "Franc suisse",
            "AED", "Dirham des Émirats"
    );

    /** Devises du bandeau exécutif : la comptabilité carbone monétaire s'y adosse. */
    private static final List<String> DEVISES_BANDEAU = List.of("EUR", "USD");

    private final CurrencyExchangeRateRepository repository;

    public CurrencyService(CurrencyExchangeRateRepository repository) {
        this.repository = repository;
    }

    /** Devises connues, avec pour chacune son cours le plus récent. */
    @Transactional(readOnly = true)
    public List<CurrencyDTO> devises() {
        return repository.findDistinctCurrencyCodes().stream()
                .map(code -> repository.findDernier(code)
                        .map(this::versDTO)
                        .orElseGet(() -> new CurrencyDTO(code, libelle(code), null, null, null,
                                CurrencyExchangeRate.PIVOT.equals(code))))
                .toList();
    }

    /**
     * Historique des cours. Sans filtre, toute la table est renvoyée ; le
     * paramètre {@code currency} restreint à une devise et {@code date} au cours
     * applicable ce jour-là.
     */
    @Transactional(readOnly = true)
    public List<CurrencyDTO> cours(String currency, LocalDate date) {
        if (currency != null && !currency.isBlank()) {
            String code = currency.trim().toUpperCase(Locale.ROOT);
            List<CurrencyExchangeRate> lignes = (date == null)
                    ? repository.findByCurrencyCodeOrderByValidFromDesc(code)
                    : repository.findApplicables(code, date);
            return lignes.stream().map(this::versDTO).toList();
        }

        if (date != null) {
            return repository.findDistinctCurrencyCodes().stream()
                    .flatMap(code -> repository.findApplicables(code, date).stream().limit(1))
                    .map(this::versDTO)
                    .toList();
        }
        return repository.findAll().stream().map(this::versDTO).toList();
    }

    /**
     * Cours de la semaine pour les devises demandées, avec variation.
     *
     * <p>La semaine est celle, ISO, de {@code reference} : du lundi au dimanche.
     * Le cours retenu est celui applicable à la date de référence — et non le
     * dernier de la table — pour qu'une consultation antérieure reste
     * reproductible.</p>
     *
     * <p>La variation compare ce cours à celui d'une semaine plus tôt, en
     * partant de sa propre date d'effet et non du calendrier. Un lundi matin, la
     * semaine n'a souvent pas encore de cotation et le cours affiché est celui
     * du vendredi précédent : le comparer à la clôture de la semaine passée
     * reviendrait à le confronter à lui-même, et toute variation ressortirait
     * à zéro.</p>
     *
     * @param codes      devises souhaitées ; EUR et USD à défaut
     * @param reference  jour d'observation ; aujourd'hui à défaut
     */
    @Transactional(readOnly = true)
    public List<WeeklyRateDTO> coursHebdomadaires(List<String> codes, LocalDate reference) {
        LocalDate jour = reference != null ? reference : LocalDate.now();
        LocalDate debutSemaine = jour.with(DayOfWeek.MONDAY);
        LocalDate finSemaine = debutSemaine.plusDays(6);
        int numeroSemaine = jour.get(WeekFields.ISO.weekOfWeekBasedYear());

        List<String> demandees = (codes == null || codes.isEmpty())
                ? DEVISES_BANDEAU
                : codes.stream().map(c -> c.trim().toUpperCase(Locale.ROOT)).distinct().toList();

        return demandees.stream()
                .map(code -> {
                    Optional<CurrencyExchangeRate> semaine = repository.findAuPlusTard(code, jour);
                    BigDecimal courant = semaine.map(CurrencyExchangeRate::getRate).orElse(null);
                    LocalDate dateCours = semaine.map(CurrencyExchangeRate::getValidFrom).orElse(null);

                    BigDecimal precedent = dateCours == null ? null
                            : repository.findAuPlusTard(code, dateCours.minusWeeks(1))
                                    .map(CurrencyExchangeRate::getRate).orElse(null);

                    return new WeeklyRateDTO(code, libelle(code), courant, precedent,
                            variation(courant, precedent), dateCours,
                            debutSemaine, finSemaine, numeroSemaine);
                })
                .toList();
    }

    /**
     * Variation relative entre deux cours, en pourcentage.
     *
     * <p>Renvoie {@code null} plutôt que zéro lorsqu'un des deux cours manque :
     * une variation nulle affichée serait comprise comme une stabilité constatée,
     * pas comme une absence d'historique.</p>
     */
    private BigDecimal variation(BigDecimal courant, BigDecimal precedent) {
        if (courant == null || precedent == null || precedent.signum() == 0) {
            return null;
        }
        return courant.subtract(precedent)
                .multiply(BigDecimal.valueOf(100))
                .divide(precedent, 2, RoundingMode.HALF_UP);
    }

    private CurrencyDTO versDTO(CurrencyExchangeRate taux) {
        return new CurrencyDTO(
                taux.getCurrencyCode(),
                libelle(taux.getCurrencyCode()),
                taux.getRate(),
                taux.getValidFrom(),
                taux.getValidTo(),
                CurrencyExchangeRate.PIVOT.equals(taux.getCurrencyCode()));
    }

    private String libelle(String code) {
        return LIBELLES.getOrDefault(code, code);
    }
}
