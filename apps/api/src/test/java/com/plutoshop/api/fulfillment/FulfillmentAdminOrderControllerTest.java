package com.plutoshop.api.fulfillment;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class FulfillmentAdminOrderControllerTest {

    private FulfillmentAdminService service;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        service = mock(FulfillmentAdminService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new FulfillmentAdminOrderController(service))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listsManualQueueWithStatusFilter() throws Exception {
        when(service.listManualFulfillments(OrderFulfillmentStatus.READY))
                .thenReturn(List.of(new FulfillmentAdminOrderResponse(
                        81L,
                        82L,
                        83L,
                        FulfillmentType.MANUAL_INSTRUCTION,
                        "MANUAL",
                        OrderFulfillmentStatus.READY)));

        mockMvc.perform(get("/api/v1/admin/fulfillments").param("status", "READY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fulfillmentId").value(81L))
                .andExpect(jsonPath("$[0].fulfillmentType").value("MANUAL_INSTRUCTION"))
                .andExpect(jsonPath("$[0].status").value("READY"));

        verify(service).listManualFulfillments(OrderFulfillmentStatus.READY);
    }

    @Test
    void deliversManualFulfillmentWithAuthenticatedActor() throws Exception {
        when(service.deliverManual(eq(81L), any()))
                .thenReturn(new FulfillmentAdminOrderResponse(
                        81L,
                        82L,
                        83L,
                        FulfillmentType.MANUAL_INSTRUCTION,
                        "MANUAL",
                        OrderFulfillmentStatus.DELIVERED));
        Jwt jwt = Jwt.withTokenValue("synthetic-token")
                .header("alg", "none")
                .issuer("https://issuer.example.test")
                .subject("synthetic-admin")
                .build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));

        mockMvc.perform(post("/api/v1/admin/fulfillments/81/deliver"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fulfillmentId").value(81L))
                .andExpect(jsonPath("$.status").value("DELIVERED"));

        verify(service).deliverManual(eq(81L), any());
    }
}
