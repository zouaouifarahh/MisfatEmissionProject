package com.misfat.organizationservice.controller;

import com.misfat.organizationservice.dto.CurrencyDTO;
import com.misfat.organizationservice.dto.WeeklyRateDTO;
import com.misfat.organizationservice.service.CurrencyService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * Pas de {@code @CrossOrigin} ici : la gateway pose déjà l'en-tête CORS. En
 * ajouter un second ferait renvoyer deux {@code Access-Control-Allow-Origin},
 * que le navigateur refuse.
 */
@RestController
@RequestMapping("/api/v1/currencies")
public class CurrencyController {

    private final CurrencyService currencyService;

    public CurrencyController(CurrencyService currencyService) {
        this.currencyService = currencyService;
    }

    /** Devises disponibles, chacune avec son cours le plus récent. */
    @GetMapping
    public List<CurrencyDTO> devises() {
        return currencyService.devises();
    }

    /**
     * Historique des cours ; {@code ?currency=EUR} restreint à une devise et
     * {@code ?date=2026-01-15} au cours applicable à cette date.
     */
    @GetMapping("/exchange-rates")
    public List<CurrencyDTO> cours(
            @RequestParam(name = "currency", required = false) String currency,
            @RequestParam(name = "date", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return currencyService.cours(currency, date);
    }

    /**
     * Cours de la semaine et variation, pour le bandeau du tableau de bord.
     *
     * <p>{@code ?codes=EUR,USD,MAD} choisit les devises et {@code ?date=…} la
     * semaine observée ; sans paramètre, EUR et USD de la semaine en cours.</p>
     */
    @GetMapping("/weekly")
    public List<WeeklyRateDTO> hebdomadaire(
            @RequestParam(name = "codes", required = false) List<String> codes,
            @RequestParam(name = "date", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return currencyService.coursHebdomadaires(codes, date);
    }
}
