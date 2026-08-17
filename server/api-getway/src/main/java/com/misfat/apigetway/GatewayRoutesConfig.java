package com.misfat.apigetway;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.function.ServerResponse;

import static org.springframework.cloud.gateway.server.mvc.filter.LoadBalancerFilterFunctions.lb;
import static org.springframework.cloud.gateway.server.mvc.handler.GatewayRouterFunctions.route;
import static org.springframework.cloud.gateway.server.mvc.handler.HandlerFunctions.http;
import static org.springframework.cloud.gateway.server.mvc.predicate.GatewayRequestPredicates.path;

@Configuration
public class GatewayRoutesConfig {

    // ---------- ORGANIZATION-SERVICE ----------

    @Bean
    public RouterFunction<ServerResponse> anneesRoute() {
        return route("organization-annees")
                .route(path("/api/annees/**"), http())
                .filter(lb("ORGANIZATION-SERVICE"))
                .build();
    }

    @Bean
    public RouterFunction<ServerResponse> filialesRoute() {
        return route("organization-filiales")
                .route(path("/api/filiales/**"), http())
                .filter(lb("ORGANIZATION-SERVICE"))
                .build();
    }

    @Bean
    public RouterFunction<ServerResponse> usinesRoute() {
        return route("organization-usines")
                .route(path("/api/usines/**"), http())
                .filter(lb("ORGANIZATION-SERVICE"))
                .build();
    }

    /** Devises et cours de change, alimentés par le référentiel MISFAT. */
    @Bean
    public RouterFunction<ServerResponse> currenciesRoute() {
        return route("organization-currencies")
                .route(path("/api/v1/currencies/**"), http())
                .filter(lb("ORGANIZATION-SERVICE"))
                .build();
    }

    // ---------- EMISSION-SERVICE ----------

    @Bean
    public RouterFunction<ServerResponse> emissionRoutes() {
        return route("emission-service")
                .route(path("/api/emission/**"), http())
                .filter(lb("EMISSION-SERVICE"))
                .build();
    }

    // ---------- USER_SERVICE ----------
    //
    // Le souligné n'est pas une coquille : user_service s'enregistre auprès
    // d'Eureka sous « USER_SERVICE », là où les autres modules emploient un
    // tiret. Le résolveur compare ces noms tels quels — « USER-SERVICE » ne
    // trouvait aucune instance et la passerelle répondait 500 sur /api/users.

    @Bean
    public RouterFunction<ServerResponse> userRoutes() {
        return route("user-service")
                .route(path("/api/users/**"), http())
                .filter(lb("USER_SERVICE"))
                .build();
    }

    @Bean
    public RouterFunction<ServerResponse> userRoutesAlt() {
        return route("user-service-alt")
                .route(path("/api/user/**"), http())
                .filter(lb("USER_SERVICE"))
                .build();
    }

    // ---------- DATA-IMPORT-SERVICE ----------

    @Bean
    public RouterFunction<ServerResponse> importSourcesRoute() {
        return route("data-import-sources")
                .route(path("/api/v1/import-sources/**"), http())
                .filter(lb("DATA-IMPORT-SERVICE"))
                .build();
    }

    @Bean
    public RouterFunction<ServerResponse> importLogsRoute() {
        return route("data-import-logs")
                .route(path("/api/v1/import-logs/**"), http())
                .filter(lb("DATA-IMPORT-SERVICE"))
                .build();
    }

    /** Dépôt de fichiers Excel (multipart). */
    @Bean
    public RouterFunction<ServerResponse> importUploadRoute() {
        return route("data-import-upload")
                .route(path("/api/v1/imports/**"), http())
                .filter(lb("DATA-IMPORT-SERVICE"))
                .build();
    }
}