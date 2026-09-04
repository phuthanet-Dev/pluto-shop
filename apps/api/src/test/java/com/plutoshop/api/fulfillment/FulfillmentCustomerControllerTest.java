package com.plutoshop.api.fulfillment;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class FulfillmentCustomerControllerTest {

    private FulfillmentCustomerService service;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        service = mock(FulfillmentCustomerService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new FulfillmentCustomerController(service))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
    }

    @Test
    void fulfillmentViewResponseIsMarkedNoStore() throws Exception {
        when(service.getOrderFulfillment(any(), eq(91L)))
                .thenReturn(new CustomerFulfillmentResponse(91L, "PAID", java.util.List.of()));

        mockMvc.perform(get("/api/v1/orders/91/fulfillment"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void revealResponseIsMarkedNoStore() throws Exception {
        when(service.reveal(any(), eq(91L), eq(92L)))
                .thenReturn(new FulfillmentRevealResponse(
                        44L, FulfillmentType.LICENSE_KEY, "SYNTHETIC", Map.of()));

        mockMvc.perform(post("/api/v1/orders/91/fulfillment/items/92/reveal"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"));
    }
}
