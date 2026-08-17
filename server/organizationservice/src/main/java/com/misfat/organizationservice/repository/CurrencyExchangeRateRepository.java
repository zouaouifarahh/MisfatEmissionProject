package com.misfat.organizationservice.repository;

import com.misfat.organizationservice.entity.CurrencyExchangeRate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface CurrencyExchangeRateRepository extends JpaRepository<CurrencyExchangeRate, Long> {

    boolean existsByCurrencyCodeAndValidFrom(String currencyCode, LocalDate validFrom);

    List<CurrencyExchangeRate> findByCurrencyCodeOrderByValidFromDesc(String currencyCode);

    @Query("SELECT DISTINCT r.currencyCode FROM CurrencyExchangeRate r ORDER BY r.currencyCode")
    List<String> findDistinctCurrencyCodes();

    /** Cours le plus récent connu pour une devise. */
    @Query("SELECT r FROM CurrencyExchangeRate r WHERE r.currencyCode = :code " +
            "ORDER BY r.validFrom DESC, r.id DESC")
    List<CurrencyExchangeRate> findDerniers(@Param("code") String code);

    /** Cours applicable à une date donnée. */
    @Query("SELECT r FROM CurrencyExchangeRate r WHERE r.currencyCode = :code " +
            "AND r.validFrom <= :date AND (r.validTo IS NULL OR r.validTo >= :date) " +
            "ORDER BY r.validFrom DESC")
    List<CurrencyExchangeRate> findApplicables(@Param("code") String code, @Param("date") LocalDate date);

    /**
     * Dernier cours connu à une date donnée, sans exiger que la période de
     * validité couvre cette date.
     *
     * <p>Complète {@link #findApplicables} : un cours dont le {@code validTo} est
     * dépassé reste la meilleure information disponible pour une semaine sans
     * cotation, alors que la requête de validité ne renverrait rien.</p>
     */
    @Query("SELECT r FROM CurrencyExchangeRate r WHERE r.currencyCode = :code " +
            "AND r.validFrom <= :date ORDER BY r.validFrom DESC, r.id DESC")
    List<CurrencyExchangeRate> findDerniersAvant(@Param("code") String code, @Param("date") LocalDate date);

    default Optional<CurrencyExchangeRate> findDernier(String code) {
        return findDerniers(code).stream().findFirst();
    }

    /** Cours en vigueur à {@code date}, à défaut le dernier connu avant elle. */
    default Optional<CurrencyExchangeRate> findAuPlusTard(String code, LocalDate date) {
        return findApplicables(code, date).stream().findFirst()
                .or(() -> findDerniersAvant(code, date).stream().findFirst());
    }
}
