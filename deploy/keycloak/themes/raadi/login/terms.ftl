<#import "template.ftl" as layout>
<#import "buttons.ftl" as buttons>
<#-- Same as keycloak.v2/terms.ftl, but the text gets the app's base URL ({0}) for its links. -->
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        ${msg("termsTitle")}
    <#elseif section = "form">
    <div class="${properties.kcContentWrapperClass}">
        ${kcSanitize(msg("termsText", (client.baseUrl)!"/"))?no_esc}
    </div>
    <form class="${properties.kcFormClass!}" action="${url.loginAction}" method="POST">
        <@buttons.actionGroup horizontal=true>
            <@buttons.button name="accept" id="kc-accept" label="doAccept"/>
            <@buttons.button name="cancel" id="kc-decline" label="doDecline" type="secondary"/>
        </@buttons.actionGroup>
    </form>
    <div class="clearfix"></div>
    </#if>
</@layout.registrationLayout>
